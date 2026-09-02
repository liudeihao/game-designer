"""Persist CompactResult into AgentState checkpoint fields."""

from __future__ import annotations

from typing import Any

from .history import history_as_chat_messages
from .policy import CompactResult


def replacement_state_update(
    result: CompactResult,
    *,
    source_message_count: int,
    source_fingerprint: str = "",
    previous_window: int = 0,
) -> dict[str, Any]:
    """Build the atomically persisted active-history checkpoint fields."""
    if not result.compacted:
        return {}
    window = max(0, int(previous_window or 0)) + 1
    replacement = history_as_chat_messages(
        summary=result.summary,
        recent_messages=result.recent_messages,
    )
    return {
        "active_context_messages": replacement,
        "active_context_source_count": max(0, int(source_message_count or 0)),
        "active_context_source_fingerprint": source_fingerprint,
        "compaction_window": window,
        "compaction_checkpoint": {
            "window": window,
            "source_message_count": max(0, int(source_message_count or 0)),
            "source_fingerprint": source_fingerprint,
            "summary_upto": int(result.summary_upto or 0),
            "estimated_tokens": int(result.estimated_tokens or 0),
            "token_budget": int(result.token_budget or 0),
            **dict(result.telemetry or {}),
        },
    }


def memory_state_update(
    result: CompactResult,
    *,
    source_message_count: int = 0,
    source_fingerprint: str = "",
    previous_window: int = 0,
) -> dict[str, Any]:
    """Fields to merge into AgentState after a compact pass."""
    update = {
        "conversation_summary": result.summary or "",
        "summary_upto": int(result.summary_upto or 0),
    }
    if result.compacted and result.telemetry:
        update["last_compaction"] = dict(result.telemetry)
    update.update(
        replacement_state_update(
            result,
            source_message_count=source_message_count,
            source_fingerprint=source_fingerprint,
            previous_window=previous_window,
        )
    )
    return update
