"""Project conversation snapshot projections for API responses."""

from __future__ import annotations

from typing import Optional

from app.agent.plan.status import PLAN_DRAFTING
from app.conversations.runtime import (
    ConversationSnapshot,
    _pending_from_snapshot,
    serialize_messages,
    workspace_from_state,
)


def workspace_dict(snapshot) -> dict[str, str]:
    if isinstance(snapshot, ConversationSnapshot):
        return snapshot.workspace_files
    values = getattr(snapshot, "agent_state", None)
    if isinstance(values, dict):
        return workspace_from_state(values)
    return workspace_from_state(getattr(snapshot, "values", None) or {})


def activity(snapshot) -> list[dict]:
    if isinstance(snapshot, ConversationSnapshot):
        return snapshot.activity
    values = getattr(snapshot, "agent_state", None) or getattr(snapshot, "values", None) or {}
    return list(values.get("activity") or [])


def events(snapshot) -> list[dict]:
    if isinstance(snapshot, ConversationSnapshot):
        return snapshot.events
    values = getattr(snapshot, "agent_state", None) or getattr(snapshot, "values", None) or {}
    return list(values.get("events") or [])


def raw_messages(snapshot) -> list:
    if isinstance(snapshot, ConversationSnapshot):
        return snapshot.messages
    values = getattr(snapshot, "agent_state", None) or getattr(snapshot, "values", None) or {}
    return list(values.get("messages") or [])


def messages(snapshot) -> list[dict]:
    if isinstance(snapshot, ConversationSnapshot):
        return serialize_messages(snapshot.messages)
    if isinstance(snapshot, list):
        return serialize_messages(snapshot)
    values = getattr(snapshot, "agent_state", None) or getattr(snapshot, "values", None) or {}
    return serialize_messages(list(values.get("messages") or []))


def pending(snapshot) -> Optional[dict]:
    if isinstance(snapshot, ConversationSnapshot):
        return snapshot.pending
    return _pending_from_snapshot(snapshot)


def messages_with_pending_ask(snapshot) -> list[dict]:
    if isinstance(snapshot, ConversationSnapshot):
        return snapshot.ui_messages()
    view = ConversationSnapshot(
        conversation_id="",
        agent_state={"messages": raw_messages(snapshot)},
        pending=pending(snapshot),
    )
    return view.ui_messages()


def plan_markdown(snapshot) -> str:
    if isinstance(snapshot, ConversationSnapshot):
        return snapshot.plan_markdown
    values = getattr(snapshot, "agent_state", None) or getattr(snapshot, "values", None) or {}
    return str(values.get("plan_markdown") or "")


def plan_title(snapshot) -> str:
    if isinstance(snapshot, ConversationSnapshot):
        return snapshot.plan_title
    values = getattr(snapshot, "agent_state", None) or getattr(snapshot, "values", None) or {}
    return str(values.get("plan_title") or "")


def plan_status(snapshot) -> str:
    if isinstance(snapshot, ConversationSnapshot):
        return snapshot.plan_status
    values = getattr(snapshot, "agent_state", None) or getattr(snapshot, "values", None) or {}
    return str(values.get("plan_status") or PLAN_DRAFTING)
