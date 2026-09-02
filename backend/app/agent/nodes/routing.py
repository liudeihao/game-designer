"""Route labels and edges after LLM / tools / permission gate."""

from __future__ import annotations

from app.agent.cancel import cancel_requested
from app.state import AgentState

from ._scratch import pending_held, scratch

ROUTE_LLM = "agent_llm"
ROUTE_GATE = "permission_gate"
ROUTE_TOOLS = "agent_tools"
ROUTE_CHOICE = "user_choice"
ROUTE_FINAL = "turn_finalize"


def route_after_llm(state: AgentState) -> str:
    if cancel_requested():
        return ROUTE_FINAL
    current = scratch(state)
    if current.get("retry"):
        return ROUTE_LLM
    pending = pending_held(state)
    if pending:
        if current.get("pending_calls"):
            return ROUTE_GATE
        return ROUTE_CHOICE
    if current.get("pending_calls"):
        return ROUTE_GATE
    return ROUTE_FINAL


def route_after_tools(state: AgentState) -> str:
    if cancel_requested():
        return ROUTE_FINAL
    current = scratch(state)
    if pending_held(state):
        return ROUTE_CHOICE
    max_rounds = max(1, int(current.get("max_rounds") or 1))
    round_i = int(current.get("round") or 0)
    if round_i < max_rounds:
        return ROUTE_LLM
    return ROUTE_FINAL


def route_after_gate(state: AgentState) -> str:
    return ROUTE_TOOLS
