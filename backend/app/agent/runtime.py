"""Shared turn helpers. Plan / Agent / Ask are profiles over the same graph."""

from __future__ import annotations

import logging
from dataclasses import dataclass, replace
from typing import Any, Callable, Optional

from langchain_core.messages import AIMessage

from app.agent.helpers import (
    COMPACT_DONE_MESSAGE,
    compaction_status_hooks,
    emit,
)
from app.agent.plan.prompts import PLAN_SYSTEM_PROMPT
from app.agent.prompt import assemble_turn_messages
from app.agent.studio.prompts import ASK_AGENT_SYSTEM, MAIN_AGENT_SYSTEM
from app.agent.tools.choice import USER_CHOICE_HOLD_TOOLS
from app.agent.tools.deps import ASK, NORMAL, PLAN, normalize_mode
from app.agent.tools.plan_panel import plan_trace_kind
from app.config import get_config
from app.docs import DocsSession
from app.llm import get_llm
from app.memory.history import (
    history_as_chat_messages,
    messages_fingerprint,
    resolve_active_history,
)
from app.memory.policy import CompactResult, ensure_compact_context
from app.memory.state_update import memory_state_update
from app.memory.tokens import estimate_tokens
from app.rules import compose_system_prompt, read_project_rules, read_user_rules
from app.state import AgentState


logger = logging.getLogger(__name__)

AGENT_MAX_ROUNDS = 24
ASK_MAX_ROUNDS = 12
PLAN_MAX_ROUNDS = 24

STUDIO_EMPTY_ANSWER = (
    "我这边没能生成有效回复。你可以换个问法，或直接说希望我帮你设计哪一块。"
)


@dataclass(frozen=True)
class AgentProfile:
    """Mode-specific knobs. The loop, catalog, and compact algorithm stay shared."""

    mode: str
    system_prompt: str
    node: str
    trace_agent: str
    max_rounds: int
    compact_purpose: str
    writable: bool = False
    append_workspace_card: bool = False
    empty_answer: str = ""
    trace_kind_for: Optional[Callable[[str], str]] = None
    hold_tools: frozenset[str] = frozenset()
    enforce_plan_chat: bool = False


def empty_scratch() -> dict[str, Any]:
    return {
        "round": 0,
        "preambles": [],
        "answer": "",
        "reasoning": "",
        "pending_calls": [],
        "decisions": [],
        "writes": [],
        "read_paths": [],
        "listed_dirs": [],
        "revs": {},
        "wrote_plan": False,
        "retry": False,
        "rebuild_turn": False,
        "streamed": False,
        "emitted_answer": "",
        "max_rounds": AGENT_MAX_ROUNDS,
        "memory": {},
    }


def resolve_profile(state: AgentState) -> AgentProfile:
    """Plan / Ask / Agent-at-rest are profiles over the same graph nodes."""
    mode = normalize_mode(state.get("mode"))
    if mode == PLAN:
        return AgentProfile(
            mode=PLAN,
            system_prompt=PLAN_SYSTEM_PROMPT,
            node="agent_llm",
            trace_agent="Plan",
            max_rounds=PLAN_MAX_ROUNDS,
            compact_purpose="供游戏设计规划（Plan）继续追问、改计划与确认待办使用",
            writable=False,
            append_workspace_card=True,
            empty_answer="",
            trace_kind_for=plan_trace_kind,
            hold_tools=USER_CHOICE_HOLD_TOOLS,
            enforce_plan_chat=True,
        )
    is_ask = mode == ASK
    return AgentProfile(
        mode=ASK if is_ask else NORMAL,
        system_prompt=ASK_AGENT_SYSTEM if is_ask else MAIN_AGENT_SYSTEM,
        node="agent_llm",
        trace_agent="Agent",
        max_rounds=ASK_MAX_ROUNDS if is_ask else AGENT_MAX_ROUNDS,
        compact_purpose=(
            "供 Ask 模式只读问答" if is_ask else "供 Agent 继续理解用户意图并写入设计文档"
        ),
        writable=not is_ask,
        empty_answer=STUDIO_EMPTY_ANSWER,
        hold_tools=USER_CHOICE_HOLD_TOOLS,
    )


def extra_suffix_for(state: AgentState, profile: AgentProfile, session: DocsSession | None = None) -> str:
    if not profile.append_workspace_card:
        return ""
    from app.agent.plan.prompts import build_plan_workspace_prompt
    from app.docs import workspace_card

    if session is None:
        session = DocsSession(str(state.get("project_id") or ""), writable=False)
    tree = session.files if session else {}
    names = sorted(tree.keys())
    workspace_empty = names == ["README.md"] or not names
    return build_plan_workspace_prompt(
        state.get("plan_markdown", "") or "",
        workspace_summary=workspace_card(tree),
        workspace_empty=workspace_empty,
    )


def composed_profile(state: AgentState, profile: AgentProfile) -> AgentProfile:
    project_id = str(state.get("project_id") or "")
    composed = compose_system_prompt(
        profile.system_prompt,
        user_rules=read_user_rules(),
        project_rules=read_project_rules(project_id) if project_id else [],
    )
    if composed != profile.system_prompt:
        return replace(profile, system_prompt=composed)
    return profile


def workspace_session_from_state(state: AgentState, *, writable: bool) -> DocsSession:
    """Rebuild a turn session from checkpointed bookkeeping + disk."""
    scratch = dict(state.get("turn_scratch") or {})
    session = DocsSession(
        str(state.get("project_id") or ""),
        writable=writable,
        require_read_before_write=writable,
    )
    session.writes = list(state.get("workspace_writes") or scratch.get("writes") or [])
    session.read_paths = set(state.get("read_paths") or scratch.get("read_paths") or [])
    session.listed_dirs = set(state.get("listed_dirs") or scratch.get("listed_dirs") or [])
    saved_revs = state.get("workspace_revs") or scratch.get("revs") or {}
    if isinstance(saved_revs, dict):
        for path, rev in saved_revs.items():
            try:
                session.revs[str(path)] = int(rev)
            except (TypeError, ValueError):
                continue
    return session


def capture_scratch(scratch: dict[str, Any], **fields: Any) -> dict[str, Any]:
    out = dict(scratch)
    out.update(fields)
    return out


def bind_profile_llm(profile: AgentProfile, tools: list[Any]) -> tuple[Any, list[Any]]:
    llm = get_llm(utility=False)
    bound_tools = list(tools)
    if bound_tools:
        try:
            llm = llm.bind_tools(bound_tools)
        except Exception as exc:
            logger.exception("bind_tools failed")
            emit(profile.trace_agent, "error", f"工具绑定失败：{exc}")
            bound_tools = []
    return llm, bound_tools


def _primary_endpoint():
    return get_config().llm.resolve(utility=False)


def _primary_model() -> str:
    endpoint = _primary_endpoint()
    return endpoint.model if endpoint else ""


def _primary_provider_id() -> str:
    endpoint = _primary_endpoint()
    return endpoint.provider_id if endpoint else ""


async def prepare_turn_context(
    state: AgentState,
    profile: AgentProfile,
    *,
    extra_suffix: str = "",
    force_compact: bool = False,
    compact_trigger: str = "auto",
    compact_phase: str = "pre_turn",
) -> tuple[list[Any], dict[str, Any], CompactResult]:
    """Compact if needed, then assemble the canonical request for this profile."""
    instruction = (state.get("instruction") or "").strip()
    all_messages = list(state.get("messages") or [])
    summary_upto = max(0, min(int(state.get("summary_upto") or 0), len(all_messages)))
    current_summary = state.get("conversation_summary") or ""
    model = _primary_model()
    provider_id = _primary_provider_id()

    active_history = resolve_active_history(
        all_messages,
        active_messages=state.get("active_context_messages") or [],
        source_message_count=int(state.get("active_context_source_count") or 0),
        source_fingerprint=str(state.get("active_context_source_fingerprint") or ""),
        summary=current_summary,
        summary_upto=summary_upto,
    )
    uncompacted = assemble_turn_messages(
        system_prompt=profile.system_prompt,
        history=active_history,
        instruction=instruction,
        extra_suffix=extra_suffix,
    )
    on_start, on_end = compaction_status_hooks(profile.trace_agent)
    compact = await ensure_compact_context(
        all_messages,
        existing_summary=current_summary,
        summary_upto=summary_upto,
        fixed_prefix_tokens=estimate_tokens(profile.system_prompt, model=model),
        keep_turns=4,
        model=model,
        provider_id=provider_id,
        purpose=profile.compact_purpose,
        compaction_messages=uncompacted,
        compaction_utility=True,
        force=force_compact,
        trigger=compact_trigger,
        phase=compact_phase,
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
                "summary_upto": compact.summary_upto,
                "compaction": compact.telemetry,
            },
        )
    history = (
        history_as_chat_messages(
            summary=compact.summary,
            recent_messages=compact.recent_messages,
        )
        if compact.compacted
        else active_history
    )
    llm_messages = assemble_turn_messages(
        system_prompt=profile.system_prompt,
        history=history,
        instruction=instruction,
        extra_suffix=extra_suffix,
    )
    memory = memory_state_update(
        compact,
        source_message_count=len(all_messages),
        source_fingerprint=messages_fingerprint(all_messages),
        previous_window=int(state.get("compaction_window") or 0),
    )
    return llm_messages, memory, compact


def keep_held_choice(messages: list[Any], pending: dict[str, Any]) -> list[Any]:
    """Keep the frozen User Choice; do not drop sibling Tool Calls on that message."""
    from app.agent.tools.choice import rebuild_ai

    out = list(messages)
    for index in range(len(out) - 1, -1, -1):
        message = out[index]
        if not isinstance(message, AIMessage):
            continue
        extra = dict(getattr(message, "additional_kwargs", None) or {})
        extra.pop("parts", None)
        if pending.get("questions"):
            extra["plan_questions"] = pending["questions"]
        out[index] = rebuild_ai(message, extra=extra)
        break
    return out


def merge_memory(payload: dict[str, Any], memory: dict[str, Any] | None) -> dict[str, Any]:
    if not memory:
        return payload
    return {**payload, **memory}
