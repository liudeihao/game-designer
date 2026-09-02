"""When to compact, and how much history to keep."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Sequence

from langchain_core.messages import BaseMessage

from .formatting import _flatten, split_turns
from .history import history_as_chat_messages
from .hooks import run_post_compact_hooks, run_pre_compact_hooks
from .request import DEFAULT_KEEP_TURNS, DEFAULT_SUMMARY_PURPOSE
from .summarize import CompactNotify, summarize_history
from .tokens import estimate_messages_tokens, estimate_tokens, token_budget


@dataclass
class CompactResult:
    """LLM-facing history after optional compaction."""

    summary: str
    summary_upto: int
    recent_messages: list[Any]
    compacted: bool
    estimated_tokens: int
    token_budget: int
    telemetry: dict[str, Any] = field(default_factory=dict)


async def ensure_compact_context(
    messages: Sequence[Any] | None,
    *,
    existing_summary: str = "",
    summary_upto: int = 0,
    fixed_prefix_tokens: int = 0,
    keep_turns: int = DEFAULT_KEEP_TURNS,
    model: str | None = None,
    provider_id: str = "",
    purpose: str = DEFAULT_SUMMARY_PURPOSE,
    compaction_messages: Sequence[BaseMessage] | None = None,
    compaction_utility: bool = False,
    force: bool = False,
    trigger: str = "auto",
    phase: str = "pre_turn",
    on_start: CompactNotify | None = None,
    on_end: CompactNotify | None = None,
) -> CompactResult:
    """Return summary + recent messages that fit the token budget.

    Full uncovered history is kept until the estimated prompt size approaches
    the model limit; only then are turns before the last *keep_turns* folded
    into *summary*. Checkpoint / UI message lists are never mutated here.
    """
    all_msgs = list(messages or [])
    budget = token_budget(model=model, provider_id=provider_id)
    summary = (existing_summary or "").strip()
    upto = max(0, min(int(summary_upto or 0), len(all_msgs)))

    uncovered = all_msgs[upto:]
    recent_for_estimate = uncovered
    est = (
        fixed_prefix_tokens
        + estimate_tokens(summary, model=model)
        + estimate_messages_tokens(recent_for_estimate, model=model)
    )

    if est <= budget and not force:
        return CompactResult(
            summary=summary,
            summary_upto=upto,
            recent_messages=list(uncovered),
            compacted=False,
            estimated_tokens=est,
            token_budget=budget,
        )

    turns = split_turns(all_msgs)
    effective_keep_turns = min(keep_turns, max(0, len(turns) - 1))
    recent_turns = turns[-effective_keep_turns:] if effective_keep_turns else []
    older_turns = turns[:-effective_keep_turns] if effective_keep_turns else turns
    older_flat = _flatten(older_turns)
    recent_flat = _flatten(recent_turns)

    to_fold = older_flat[upto:] if upto < len(older_flat) else []
    if to_fold or ((est > budget or force) and older_flat):
        if not to_fold and older_flat:
            to_fold = older_flat
            summary = ""
        compaction_telemetry: dict[str, Any] = {
            "trigger": trigger,
            "phase": phase,
            "input_tokens_before": est,
            "token_budget": budget,
            "summary_upto_before": upto,
        }
        hook_event = {
            **compaction_telemetry,
            "message_count": len(all_msgs),
            "keep_turns": effective_keep_turns,
        }
        await run_pre_compact_hooks(hook_event)
        new_summary = await summarize_history(
            existing_summary=summary,
            older_messages=to_fold,
            recent_messages=recent_flat,
            purpose=purpose,
            compaction_messages=compaction_messages,
            utility=compaction_utility,
            keep_turns=effective_keep_turns,
            telemetry=compaction_telemetry,
            on_start=on_start,
            on_end=on_end,
        )
        new_upto = len(all_msgs) - len(recent_flat)
        new_est = (
            fixed_prefix_tokens
            + estimate_tokens(new_summary, model=model)
            + estimate_messages_tokens(recent_flat, model=model)
        )
        result = CompactResult(
            summary=new_summary,
            summary_upto=max(0, new_upto),
            recent_messages=recent_flat,
            compacted=True,
            estimated_tokens=new_est,
            token_budget=budget,
            telemetry={
                **compaction_telemetry,
                "input_tokens_after": new_est,
                "summary_upto_after": max(0, new_upto),
            },
        )
        await run_post_compact_hooks({**hook_event, **result.telemetry})
        return result

    return CompactResult(
        summary=summary,
        summary_upto=upto,
        recent_messages=list(uncovered),
        compacted=False,
        estimated_tokens=est,
        token_budget=budget,
    )


async def compact_request_if_needed(
    messages: Sequence[BaseMessage],
    *,
    model: str = "",
    provider_id: str = "",
    purpose: str = DEFAULT_SUMMARY_PURPOSE,
    keep_turns: int = 2,
    trigger: str = "auto",
    phase: str = "mid_turn",
    on_start: CompactNotify | None = None,
    on_end: CompactNotify | None = None,
) -> tuple[list[BaseMessage], CompactResult]:
    """Compact an in-flight canonical request before an additional LLM step."""
    canonical = list(messages)
    prefix: list[BaseMessage] = []
    conversation: list[BaseMessage] = []
    in_conversation = False
    for message in canonical:
        if not in_conversation and getattr(message, "type", "") == "system":
            prefix.append(message)
        else:
            in_conversation = True
            conversation.append(message)
    result = await ensure_compact_context(
        conversation,
        fixed_prefix_tokens=estimate_messages_tokens(prefix, model=model),
        keep_turns=keep_turns,
        model=model,
        provider_id=provider_id,
        purpose=purpose,
        compaction_messages=canonical,
        compaction_utility=True,
        trigger=trigger,
        phase=phase,
        on_start=on_start,
        on_end=on_end,
    )
    if not result.compacted:
        return canonical, result
    replacement = [
        *history_as_chat_messages(summary="", recent_messages=prefix),
        *history_as_chat_messages(
            summary=result.summary,
            recent_messages=result.recent_messages,
        ),
    ]
    return replacement, result
