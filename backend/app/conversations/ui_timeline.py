"""Accumulate the chat-column timeline from SSE custom events."""

from __future__ import annotations

from typing import Any, Optional

from langchain_core.messages import AIMessage

from app.agent.tools.mode import SUGGEST_MODE_TOOL, default_message, target_mode
from app.agent.tools.plan_panel import USER_CHOICE_PENDING

USER_CHOICE_TOOLS = frozenset({"ask_user", SUGGEST_MODE_TOOL})


def pending_from_tool_args(name: str, args: dict[str, Any] | None) -> Optional[dict[str, Any]]:
    a = args or {}
    if name == "ask_user":
        return {
            "type": USER_CHOICE_PENDING,
            "variant": "questions",
            "message": str(a.get("message") or "").strip() or "在继续之前，我想先确认几件事：",
            "questions": list(a.get("questions") or []),
        }
    if name == SUGGEST_MODE_TOOL:
        mode = target_mode(str(a.get("mode") or ""))
        return {
            "type": USER_CHOICE_PENDING,
            "variant": "suggest_mode",
            "mode": mode,
            "message": str(a.get("message") or "").strip() or default_message(mode),
            "reason": str(a.get("reason") or ""),
        }
    return None


class UiTimeline:
    def __init__(self) -> None:
        self.reasoning = ""
        self.blocks: list[dict[str, Any]] = []
        self.traces: dict[str, dict[str, Any]] = {}

    def on_event(self, event: str, data: dict[str, Any]) -> None:
        if event == "reasoning":
            self.reasoning += str(data.get("text") or "")
            return
        if event == "token":
            text = str(data.get("text") or "")
            if not text:
                return
            if self.blocks and self.blocks[-1].get("type") == "text":
                self.blocks[-1]["content"] += text
            else:
                self.blocks.append({"type": "text", "content": text})
            return
        if event == "trace_start":
            name = str(data.get("name") or "")
            tid = str(data.get("id") or "")
            if name in USER_CHOICE_TOOLS:
                self.blocks.append(
                    {
                        "type": "user_choice",
                        "id": tid,
                        "name": name,
                        "args": data.get("args") or {},
                    }
                )
                return
            if data.get("kind") == "compaction" or name == "compact_context":
                return
            self.blocks.append({"type": "trace", "id": tid})
            self.traces[tid] = {
                "type": "trace",
                "id": tid,
                "agent": data.get("agent") or "",
                "name": name,
                "status": "running",
                "args": data.get("args") or {},
                "kind": data.get("kind"),
            }
            return
        if event == "trace_end":
            tid = str(data.get("id") or "")
            trace = self.traces.get(tid)
            if not trace:
                return
            trace["status"] = data.get("status") or "success"
            if data.get("result") is not None:
                trace["result"] = data["result"]
            if data.get("error") is not None:
                trace["error"] = data["error"]

    def to_parts(self, pending: Optional[dict] = None) -> list[dict[str, Any]]:
        parts: list[dict[str, Any]] = []
        if self.reasoning.strip():
            parts.append({"type": "reasoning", "content": self.reasoning.strip(), "collapsed": True})
        seen_choice = False
        for block in self.blocks:
            kind = block.get("type")
            if kind == "text":
                text = str(block.get("content") or "").strip()
                if text:
                    parts.append({"type": "text", "content": text})
                continue
            if kind == "trace":
                trace = self.traces.get(str(block.get("id") or ""))
                if trace:
                    parts.append(dict(trace))
                continue
            if kind == "user_choice":
                pend = pending if pending and not seen_choice else pending_from_tool_args(
                    str(block.get("name") or ""),
                    block.get("args") if isinstance(block.get("args"), dict) else {},
                )
                seen_choice = True
                if pend:
                    parts.append(
                        {
                            "type": "user_choice",
                            "id": str(block.get("id") or "pending-choice"),
                            "pending": pend,
                            "status": "pending",
                        }
                    )
        if pending and not seen_choice:
            parts.append(
                {
                    "type": "user_choice",
                    "id": str(pending.get("tool_call_id") or pending.get("id") or "pending-choice"),
                    "pending": pending,
                    "status": "pending",
                }
            )
        return parts

    def text_content(self) -> str:
        chunks = [
            str(b.get("content") or "").strip()
            for b in self.blocks
            if b.get("type") == "text" and str(b.get("content") or "").strip()
        ]
        return "\n\n".join(chunks)


def last_ai_message(messages: list) -> Any:
    for message in reversed(messages or []):
        if getattr(message, "type", "") == "ai":
            return message
    return None


def ai_with_parts(message: Any, parts: list[dict[str, Any]], content: str) -> AIMessage:
    extra = dict(getattr(message, "additional_kwargs", None) or {}) if message is not None else {}
    extra["parts"] = parts
    kwargs: dict[str, Any] = {
        "content": content or (getattr(message, "content", "") if message is not None else "") or "",
        "additional_kwargs": extra,
    }
    if message is not None:
        mid = getattr(message, "id", None)
        if mid:
            kwargs["id"] = mid
        tool_calls = getattr(message, "tool_calls", None) or []
        if tool_calls:
            kwargs["tool_calls"] = tool_calls
    return AIMessage(**kwargs)
