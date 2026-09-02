"""Restore LLM-visible history from a summary + recent turns."""

from __future__ import annotations

import copy
import hashlib
import json
from typing import Any, Sequence

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from .formatting import message_text


def history_as_chat_messages(
    *,
    summary: str,
    recent_messages: Sequence[Any],
) -> list[BaseMessage]:
    """Build cache-friendly message suffix: optional summary + recent turns."""
    out: list[BaseMessage] = []
    if (summary or "").strip():
        out.append(
            HumanMessage(
                content=(
                    "## CONTEXT CHECKPOINT：较早轮次 Compact（事实 / 约束 / 待办）\n"
                    f"{summary.strip()}\n"
                    "（以下为最近完整对话）"
                ),
                additional_kwargs={"context_checkpoint": True},
            )
        )
    for m in recent_messages:
        if isinstance(m, BaseMessage):
            if hasattr(m, "model_copy"):
                out.append(m.model_copy(deep=True))
            else:
                out.append(copy.deepcopy(m))
        else:
            # Compatibility for legacy checkpoints containing message-like
            # objects rather than LangChain BaseMessage instances.
            role = getattr(m, "type", "") or ""
            text = message_text(m)
            if not text:
                continue
            out.append(HumanMessage(content=text) if role == "human" else AIMessage(content=text))
    return out


def messages_fingerprint(messages: Sequence[Any]) -> str:
    """Stable checkpoint baseline used to detect rewinds/branches/edits."""
    payload = []
    for message in messages:
        payload.append(
            {
                "type": getattr(message, "type", type(message).__name__),
                "id": getattr(message, "id", None),
                "content": getattr(message, "content", str(message)),
                "tool_call_id": getattr(message, "tool_call_id", None),
            }
        )
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def resolve_active_history(
    messages: Sequence[Any],
    *,
    active_messages: Sequence[Any] | None = None,
    source_message_count: int = 0,
    source_fingerprint: str = "",
    summary: str = "",
    summary_upto: int = 0,
) -> list[BaseMessage]:
    """Restore persisted replacement history and append post-checkpoint deltas."""
    all_messages = list(messages or [])
    source_count = int(source_message_count or 0)
    baseline_matches = not source_fingerprint or source_fingerprint == messages_fingerprint(
        all_messages[:source_count]
    )
    if active_messages and 0 <= source_count <= len(all_messages) and baseline_matches:
        restored = history_as_chat_messages(summary="", recent_messages=active_messages)
        delta = history_as_chat_messages(
            summary="", recent_messages=all_messages[source_count:]
        )
        return [*restored, *delta]
    upto = max(0, min(int(summary_upto or 0), len(all_messages)))
    return history_as_chat_messages(
        summary=summary,
        recent_messages=all_messages[upto:],
    )
