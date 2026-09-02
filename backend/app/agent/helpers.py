"""Shared streaming / activity helpers for Plan and Studio nodes."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from langchain_core.messages import AIMessage, ToolMessage

try:  # available inside a running graph
    from langgraph.config import get_stream_writer
except Exception:  # pragma: no cover
    get_stream_writer = None  # type: ignore


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_custom(payload: dict) -> None:
    if get_stream_writer is None:
        return
    try:
        writer = get_stream_writer()
        writer(payload)
    except Exception:
        pass


def stream_reasoning(text: str, node: str = "") -> None:
    _write_custom({"type": "reasoning", "text": text, "node": node})


def stream_token(text: str, node: str = "") -> None:
    _write_custom({"type": "token", "text": text, "node": node})


def emit_plan(markdown: str, title: str = "") -> None:
    """Push the live plan document to the right-hand panel."""
    _write_custom({"type": "plan", "markdown": markdown or "", "title": title or ""})


def new_trace_id() -> str:
    return uuid.uuid4().hex[:12]


def emit(agent: str, kind: str, message: str, detail: Optional[dict] = None) -> dict:
    """Write a live activity event to the custom stream (best-effort)."""
    entry = {
        "ts": now_iso(),
        "agent": agent,
        "kind": kind,
        "message": message,
        "detail": detail or {},
    }
    _write_custom({"type": "activity", **entry})
    return entry


def emit_trace_start(
    agent: str,
    trace_id: str,
    name: str,
    args: Optional[dict] = None,
    *,
    kind: str = "tool",
) -> dict:
    payload = {
        "type": "trace_start",
        "ts": now_iso(),
        "id": trace_id,
        "agent": agent,
        "name": name,
        "kind": kind,
        "args": args or {},
    }
    _write_custom(payload)
    return payload


def emit_trace_end(
    agent: str,
    trace_id: str,
    status: str,
    *,
    result: Optional[str] = None,
    error: Optional[str] = None,
) -> dict:
    payload: dict[str, Any] = {
        "type": "trace_end",
        "ts": now_iso(),
        "id": trace_id,
        "agent": agent,
        "status": status,
    }
    if result is not None:
        payload["result"] = result
    if error is not None:
        payload["error"] = error
    _write_custom(payload)
    return payload


COMPACT_TRACE_NAME = "compact_context"
COMPACT_DONE_MESSAGE = "已将较早轮次压缩为摘要，继续作答。"


def compaction_status_hooks(agent: str) -> tuple[Any, Any]:
    """Start/end callbacks for a hidden compaction trace (status bar only)."""
    trace_id = new_trace_id()

    def on_start() -> None:
        emit_trace_start(agent, trace_id, COMPACT_TRACE_NAME, kind="compaction")

    def on_end() -> None:
        emit_trace_end(agent, trace_id, "success")

    return on_start, on_end


def normalize_file_refs(
    *,
    writes: Optional[list[dict[str, Any]]] = None,
    paths: Optional[list[str]] = None,
) -> list[dict[str, Any]]:
    """Deduplicate workspace file refs for chat citations (Cursor-style chips)."""
    ordered: list[str] = []
    by_path: dict[str, dict[str, Any]] = {}
    for item in writes or []:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or "").strip().replace("\\", "/")
        if not path or path.endswith("/"):
            continue
        op = str(item.get("op") or "write").strip() or "write"
        if op not in {"write", "delete", "search_replace"}:
            op = "write"
        if path not in by_path:
            ordered.append(path)
        extra: dict[str, Any] = {"op": op}
        created = item.get("created")
        if created is True or created == "1":
            extra["created"] = True
        elif created is False or created == "0":
            extra["created"] = False
        old = str(item.get("old") or "").strip()
        new = str(item.get("new") or "").strip()
        if old:
            extra["old"] = old
        if new:
            extra["new"] = new
        by_path[path] = extra
    for raw in paths or []:
        path = str(raw or "").strip().replace("\\", "/")
        if not path or path.endswith("/"):
            continue
        if path not in by_path:
            ordered.append(path)
            by_path[path] = {"op": "write"}
    return [{"path": path, **by_path[path]} for path in ordered]


def _unanswered_ai_index(messages: list[Any]) -> Optional[int]:
    """Index of the last assistant whose tool_calls are still missing a result."""
    answered: set[str] = set()
    for message in messages:
        if isinstance(message, ToolMessage):
            call_id = str(getattr(message, "tool_call_id", "") or "")
            if call_id:
                answered.add(call_id)
    for index in range(len(messages) - 1, -1, -1):
        message = messages[index]
        if not isinstance(message, AIMessage):
            continue
        for call in getattr(message, "tool_calls", None) or []:
            raw = call.get("id") if isinstance(call, dict) else getattr(call, "id", "")
            if str(raw or "") not in answered:
                return index
    return None


def _merge_ai_text(message: Any, text: str, extra_base: dict[str, Any]) -> AIMessage:
    """Fold narration into an assistant instead of adding one after it."""
    extra = dict(getattr(message, "additional_kwargs", None) or {})
    extra.pop("parts", None)
    extra.update(extra_base)
    current = _content_str(message)
    if not current:
        merged = text
    elif not text or text in current:
        merged = current
    else:
        merged = f"{current}\n\n{text}"
    rebuilt: dict[str, Any] = {
        "content": merged,
        "additional_kwargs": extra,
        "id": getattr(message, "id", None),
    }
    tool_calls = list(getattr(message, "tool_calls", None) or [])
    if tool_calls:
        rebuilt["tool_calls"] = tool_calls
    return AIMessage(**rebuilt)


def persist_transcript(
    new_messages: list[Any],
    *,
    answer: str,
    reasoning: str,
    preamble: str = "",
    extra_kwargs: dict[str, Any] | None = None,
) -> list[Any]:
    """Keep AI/Tool transcript for the model. Column cards come from Events, not parts."""
    extra_base: dict[str, Any] = {}
    if reasoning.strip():
        extra_base["reasoning"] = reasoning.strip()
    if extra_kwargs:
        extra_base.update(extra_kwargs)
    text = (answer or preamble or "").strip()
    if not new_messages:
        if not text:
            return []
        return [AIMessage(content=answer or preamble, additional_kwargs=extra_base)]

    out = list(new_messages)
    held_index = _unanswered_ai_index(out)
    if held_index is not None:
        # A held User Choice waits for its tool result, so nothing may sit
        # between that assistant and the result: OpenAI-compatible APIs reject
        # the request. Narration goes onto the same assistant.
        if text or extra_base:
            out[held_index] = _merge_ai_text(out[held_index], text, extra_base)
        return out

    last = out[-1]
    tool_calls = list(getattr(last, "tool_calls", None) or [])
    if isinstance(last, AIMessage):
        content = answer or _content_str(last) or preamble
        extra = dict(getattr(last, "additional_kwargs", None) or {})
        extra.pop("parts", None)
        extra.update(extra_base)
        rebuilt: dict[str, Any] = {
            "content": content,
            "additional_kwargs": extra,
            "id": getattr(last, "id", None),
        }
        if tool_calls:
            rebuilt["tool_calls"] = tool_calls
        out[-1] = AIMessage(**rebuilt)
        return out
    if text:
        out.append(AIMessage(content=answer or preamble, additional_kwargs=extra_base))
    return out


def _content_str(message: Any) -> str:
    content = getattr(message, "content", "") or ""
    if isinstance(content, str):
        return content.strip()
    return str(content).strip() if content else ""
