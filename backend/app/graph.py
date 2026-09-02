"""Assemble the unified agent graph (shared ReAct nodes + User Choice)."""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from app.agent.context import AgentContext
from app.agent.nodes import (
    agent_llm,
    agent_tools,
    permission_gate,
    route_after_gate,
    route_after_llm,
    route_after_tools,
    turn_finalize,
    turn_setup,
)
from app.agent.plan.user_choice import after_user_choice, user_choice
from app.state import AgentState

__all__ = ["build_graph"]


def build_graph(checkpointer=None):
    builder = StateGraph(AgentState, context_schema=AgentContext)

    builder.add_node("turn_setup", turn_setup)
    builder.add_node("agent_llm", agent_llm)
    builder.add_node("permission_gate", permission_gate)
    builder.add_node("agent_tools", agent_tools)
    builder.add_node("turn_finalize", turn_finalize)
    builder.add_node("user_choice", user_choice)

    builder.add_edge(START, "turn_setup")
    builder.add_edge("turn_setup", "agent_llm")
    builder.add_conditional_edges(
        "agent_llm",
        route_after_llm,
        {
            "agent_llm": "agent_llm",
            "permission_gate": "permission_gate",
            "user_choice": "user_choice",
            "turn_finalize": "turn_finalize",
        },
    )
    builder.add_conditional_edges(
        "permission_gate",
        route_after_gate,
        {"agent_tools": "agent_tools"},
    )
    builder.add_conditional_edges(
        "agent_tools",
        route_after_tools,
        {
            "agent_llm": "agent_llm",
            "user_choice": "user_choice",
            "turn_finalize": "turn_finalize",
        },
    )
    builder.add_conditional_edges(
        "user_choice",
        after_user_choice,
        {"turn_setup": "turn_setup", "agent_llm": "agent_llm"},
    )
    builder.add_edge("turn_finalize", END)

    return builder.compile(checkpointer=checkpointer)
