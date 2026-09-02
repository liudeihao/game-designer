"""Turn scratch helpers shared by graph nodes."""

from __future__ import annotations

from typing import Any

from app.agent.loop import call_args, call_id, call_name
from app.agent.runtime import empty_scratch
from app.state import AgentState


def scratch(state: AgentState) -> dict[str, Any]:
    return dict(state.get("turn_scratch") or empty_scratch())


def request(state: AgentState) -> list[Any]:
    return list(state.get("turn_request") or [])


def call_as_dict(call: Any) -> dict[str, Any]:
    return {
        "name": call_name(call),
        "args": call_args(call),
        "id": call_id(call),
        "type": "tool_call",
    }


def pending_held(state: AgentState) -> dict[str, Any]:
    pending = state.get("pending_user_choice") or {}
    if pending.get("tool_call_id") or pending.get("type") or pending.get("questions"):
        return dict(pending)
    return {}
