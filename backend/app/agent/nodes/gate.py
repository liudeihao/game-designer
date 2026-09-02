"""HITL permission gate: interrupt, decide, emit, write scratch."""

from __future__ import annotations

from langgraph.types import interrupt

from app.agent.loop import call_args, call_id, call_name, trace_args
from app.agent.runtime import capture_scratch, resolve_profile
from app.agent.tools import tools_for_state
from app.agent.tools.catalog import catalog_names
from app.agent.tools.permission import (
    decide_permissions,
    decision_to_dict,
    hitl_enabled,
    is_workspace_mutation,
)
from app.conversations.events import human_count, tool_permission_event
from app.state import AgentState

from ._scratch import request, scratch


async def permission_gate(state: AgentState) -> dict:
    """Interrupt once per Step for all Workspace Mutations. Zero side effects first."""
    profile = resolve_profile(state)
    tools = tools_for_state(state, profile.mode)
    current = scratch(state)
    calls = list(current.get("pending_calls") or [])
    catalog = catalog_names(tools)
    bound = [c for c in calls if not catalog or call_name(c) in catalog]
    mutations = [c for c in bound if is_workspace_mutation(c)]
    need_hitl = hitl_enabled(mode=profile.mode, trigger=str(state.get("trigger") or ""))
    answers = None
    if need_hitl and mutations:
        payload = {
            "type": "tool_permission",
            "calls": [
                {
                    "id": call_id(c),
                    "name": call_name(c),
                    "args": trace_args(call_args(c)),
                }
                for c in mutations
            ],
        }
        answers = interrupt(payload)
    decisions = decide_permissions(
        bound,
        mode=profile.mode,
        trigger=str(state.get("trigger") or ""),
        answers=answers,
    )
    events = []
    humans = human_count(request(state))
    for perm in decisions:
        if perm.mutation and perm.status:
            events.append(
                tool_permission_event(
                    call_id=perm.call_id,
                    status=perm.status,
                    comment=perm.comment,
                    after_human=humans,
                )
            )
    current = capture_scratch(
        current,
        decisions=[decision_to_dict(d) for d in decisions],
    )
    return {"turn_scratch": current, "events": events}
