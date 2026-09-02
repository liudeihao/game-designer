"""Execute the pending tool batch and compact mid-turn if needed."""

from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig

from app.agent.helpers import COMPACT_DONE_MESSAGE, compaction_status_hooks, emit
from app.agent.loop import LAST_ROUND_NUDGE, run_tool_batch, tool_messages_for
from app.agent.plan.status import PLAN_READY
from app.agent.runtime import (
    capture_scratch,
    composed_profile,
    resolve_profile,
    _primary_model,
    _primary_provider_id,
)
from app.agent.tools import tools_for_state
from app.agent.tools.node import run_tool_node
from app.agent.tools.permission import decision_from_dict
from app.memory.history import messages_fingerprint
from app.memory.policy import compact_request_if_needed
from app.memory.state_update import memory_state_update
from app.state import AgentState

from ._scratch import request, scratch


async def agent_tools(state: AgentState, config: RunnableConfig) -> dict:
    profile = composed_profile(state, resolve_profile(state))
    tools = tools_for_state(state, profile.mode)
    current = scratch(state)
    llm_request = request(state)
    calls = list(current.get("pending_calls") or [])
    events: list[dict[str, Any]] = []
    permissions = [
        decision_from_dict(d) for d in (current.get("decisions") or []) if isinstance(d, dict)
    ]

    tool_extra: dict[str, Any] = {}

    async def execute_calls(run_calls, bound_tools):
        nonlocal tool_extra
        _msgs, extra, results = await run_tool_node(
            dict(state), bound_tools, run_calls, config=config
        )
        tool_extra = extra
        return results

    step_results = await run_tool_batch(
        calls,
        tools,
        execute_calls=execute_calls if tools else None,
        trace_agent=profile.trace_agent,
        trace_kind_for=profile.trace_kind_for,
        messages=llm_request,
        events=events,
        permissions=permissions,
    )
    max_rounds = max(1, int(current.get("max_rounds") or profile.max_rounds))
    round_i = int(current.get("round") or 0)
    remaining = max_rounds - round_i
    nudge = LAST_ROUND_NUDGE if remaining == 1 else ""
    tool_msgs = tool_messages_for(step_results, nudge=nudge)
    next_request = list(llm_request) + tool_msgs

    memory = dict(current.get("memory") or {})
    if profile.compact_purpose:
        on_start, on_end = compaction_status_hooks(profile.trace_agent)
        replacement, compact = await compact_request_if_needed(
            next_request,
            model=_primary_model(),
            provider_id=_primary_provider_id(),
            purpose=profile.compact_purpose or "供后续 Agent 继续本轮工具循环",
            keep_turns=2,
            trigger="auto",
            phase="mid_turn",
            on_start=on_start,
            on_end=on_end,
        )
        if compact.compacted:
            emit(
                profile.trace_agent,
                "work",
                COMPACT_DONE_MESSAGE,
                {
                    "estimated_tokens": compact.estimated_tokens,
                    "token_budget": compact.token_budget,
                    "compaction": compact.telemetry,
                },
            )
            next_request = list(replacement)
            all_messages = list(state.get("messages") or [])
            memory = {
                **memory,
                **memory_state_update(
                    compact,
                    source_message_count=len(all_messages),
                    source_fingerprint=messages_fingerprint(all_messages),
                    previous_window=int(state.get("compaction_window") or 0),
                ),
            }

    writes = list(tool_extra.get("workspace_writes") or state.get("workspace_writes") or [])
    read_paths = list(tool_extra.get("read_paths") or state.get("read_paths") or [])
    listed_dirs = list(tool_extra.get("listed_dirs") or state.get("listed_dirs") or [])
    workspace_revs = dict(tool_extra.get("workspace_revs") or state.get("workspace_revs") or {})
    wrote_plan = bool(tool_extra.get("plan_markdown"))
    payload: dict[str, Any] = {
        "turn_request": next_request,
        "messages": tool_msgs,
        "events": events,
        "read_paths": read_paths,
        "listed_dirs": listed_dirs,
        "workspace_writes": writes,
        "workspace_revs": workspace_revs,
        "turn_scratch": capture_scratch(
            current,
            pending_calls=[],
            decisions=[],
            memory=memory,
            retry=False,
            writes=writes,
            read_paths=read_paths,
            listed_dirs=listed_dirs,
            revs=workspace_revs,
            wrote_plan=bool(current.get("wrote_plan")) or wrote_plan,
        ),
    }
    payload.update(memory)
    if wrote_plan:
        payload["plan_markdown"] = tool_extra["plan_markdown"]
        payload["plan_title"] = tool_extra.get("plan_title") or ""
        payload["plan_status"] = tool_extra.get("plan_status") or PLAN_READY
    return payload
