"""Turn setup and finalize nodes."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage

from app.agent.cancel import cancel_requested
from app.agent.helpers import emit, normalize_file_refs, persist_transcript, stream_token
from app.agent.loop import message_text
from app.agent.plan.status import PLAN_DRAFTING, PLAN_READY
from app.agent.runtime import (
    STUDIO_EMPTY_ANSWER,
    composed_profile,
    empty_scratch,
    extra_suffix_for,
    merge_memory,
    prepare_turn_context,
    resolve_profile,
    workspace_session_from_state,
)
from app.state import AgentState

from ._scratch import pending_held, scratch

WRITE_CONFIRM = "已更新右侧 plan，可继续讨论或点击「执行计划」。"
INTERRUPT_NOTE = "（本轮已被用户中断，工作未完成。）"


async def turn_setup(state: AgentState) -> dict:
    profile = composed_profile(state, resolve_profile(state))
    session = workspace_session_from_state(state, writable=profile.writable)
    extra = extra_suffix_for(state, profile, session)
    llm_messages, memory, _compact = await prepare_turn_context(
        state, profile, extra_suffix=extra
    )

    trigger = (state.get("trigger") or "").strip()
    if trigger == "execute_plan":
        start = "按计划写入文档…"
    elif profile.mode == "ask":
        start = "Ask 只读查阅中…"
    elif profile.mode == "plan":
        start = "Plan 规划中…"
    else:
        start = "Agent 工作中（可按需读写工作区）…"
    emit(profile.trace_agent, "work", start)

    current = empty_scratch()
    current["max_rounds"] = profile.max_rounds
    current["memory"] = memory
    return {
        "turn_request": llm_messages,
        "turn_scratch": current,
        "pending_user_choice": {},
        "read_paths": [],
        "listed_dirs": [],
        "workspace_writes": [],
        "workspace_revs": {},
    }


async def turn_finalize(state: AgentState) -> dict:
    profile = composed_profile(state, resolve_profile(state))
    session = workspace_session_from_state(state, writable=profile.writable)
    current = scratch(state)
    answer = (current.get("answer") or "").strip()
    interrupted = cancel_requested()
    pending = {} if interrupted else pending_held(state)
    wrote_plan = bool(current.get("wrote_plan"))

    if wrote_plan and not answer and not pending:
        answer = WRITE_CONFIRM
        stream_token(answer, node=profile.node)
    elif interrupted:
        pass
    elif not answer and profile.empty_answer and not pending:
        answer = profile.empty_answer or STUDIO_EMPTY_ANSWER

    if interrupted:
        existing = list(state.get("messages") or [])
        last_text = ""
        for msg in reversed(existing):
            if isinstance(msg, AIMessage):
                last_text = message_text(msg)
                break
        preamble = "\n\n".join(current.get("preambles") or []).strip()
        base = answer or last_text or preamble
        if INTERRUPT_NOTE not in (base or ""):
            if base:
                answer = f"{base.rstrip()}\n\n{INTERRUPT_NOTE}"
                stream_token(f"\n\n{INTERRUPT_NOTE}", node=profile.node)
            else:
                answer = INTERRUPT_NOTE
                stream_token(answer, node=profile.node)
        else:
            answer = base

    writes = list(session.writes or [])
    turn_file_refs = normalize_file_refs(writes=writes)
    if turn_file_refs:
        emit(
            profile.trace_agent,
            "work",
            session.summary_line() or f"本轮改动 {len(turn_file_refs)} 个文件。",
            {"writes": turn_file_refs},
        )

    persist: list[Any] = []
    extra_kwargs = {"interrupted": True} if interrupted else None
    if answer:
        persist = persist_transcript(
            [],
            answer=answer,
            reasoning=str(current.get("reasoning") or ""),
            preamble="\n\n".join(current.get("preambles") or []).strip(),
            extra_kwargs=extra_kwargs,
        )
        existing = list(state.get("messages") or [])
        last_ai = None
        for msg in reversed(existing):
            if isinstance(msg, AIMessage):
                last_ai = msg
                break
        if last_ai is not None and persist:
            persist = persist_transcript(
                [last_ai],
                answer=answer,
                reasoning=str(current.get("reasoning") or ""),
                preamble="\n\n".join(current.get("preambles") or []).strip(),
                extra_kwargs=extra_kwargs,
            )

    payload: dict[str, Any] = {
        "turn_request": [],
        "turn_scratch": empty_scratch(),
        "pending_user_choice": pending or {},
        "trigger": "" if (state.get("trigger") or "").strip() == "execute_plan" else (state.get("trigger") or ""),
        "read_paths": [],
        "listed_dirs": [],
        "workspace_writes": [],
        "workspace_revs": {},
    }
    if persist:
        payload["messages"] = persist
    memory = dict(current.get("memory") or {})
    payload = merge_memory(payload, memory)
    if wrote_plan:
        payload["plan_status"] = PLAN_READY
    elif profile.mode == "plan":
        payload.setdefault("plan_status", state.get("plan_status") or PLAN_DRAFTING)
    return payload
