"""Shared ReAct helpers for graph nodes (Plan and Studio)."""

from __future__ import annotations

import logging
from typing import Any, Callable, Optional

from langchain_core.messages import AIMessage, AIMessageChunk, ToolMessage

from app.agent.cancel import cancel_requested
from app.agent.helpers import (
    emit_trace_end,
    emit_trace_start,
    new_trace_id,
    stream_reasoning,
    stream_token,
)
from app.agent.tools.catalog import catalog_miss_message, catalog_names
from app.agent.tools.executor import execute_tool_calls
from app.agent.tools.permission import result_outcome
from app.conversations.events import (
    human_count,
    rule_proposal_event,
    tool_call_event,
    tool_result_event,
)
from app.llm import extract_answer_text, extract_reasoning_text
from app.rules import (
    DUPLICATE_PROPOSAL,
    PROPOSE_RULE_TOOL,
    already_proposed_this_turn,
    normalize_proposal_args,
)

logger = logging.getLogger(__name__)

_OBS_LIMIT = 8_000

__all__ = [
    "LAST_ROUND_NUDGE",
    "call_args",
    "call_id",
    "call_model",
    "call_name",
    "extract_answers",
    "held_user_choice",
    "message_reasoning",
    "message_text",
    "plan_write_dest",
    "run_tool_batch",
    "split_hold_calls",
    "stamp_held_choice",
    "tool_messages_for",
    "trace_args",
]


def _coerce_ai_message(message: Any) -> Any:
    """Normalize astream chunks to AIMessage (type 'ai') for transcript/UI checks."""
    if not isinstance(message, AIMessageChunk):
        return message
    return AIMessage(
        content=message.content,
        additional_kwargs=dict(message.additional_kwargs or {}),
        response_metadata=dict(message.response_metadata or {}),
        tool_calls=list(message.tool_calls or []),
        invalid_tool_calls=list(getattr(message, "invalid_tool_calls", None) or []),
        id=message.id,
    )


def _has_tool_signal(chunk: Any, gathered: Any) -> bool:
    """True once the model is clearly producing tool calls (not a user-facing reply)."""
    if getattr(chunk, "tool_call_chunks", None):
        return True
    for msg in (chunk, gathered):
        if not msg:
            continue
        if getattr(msg, "tool_calls", None):
            return True
        if getattr(msg, "invalid_tool_calls", None):
            return True
    return False


def extract_answers(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    if "answers" in payload and isinstance(payload["answers"], dict):
        return payload["answers"]
    return payload


def message_text(message: Any) -> str:
    content = getattr(message, "content", "") or ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text") or ""))
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts).strip()
    return str(content).strip() if content else ""


def message_reasoning(message: Any) -> str:
    extra = getattr(message, "additional_kwargs", None) or {}
    for key in ("reasoning_content", "reasoning", "thinking"):
        value = extra.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    content = getattr(message, "content", "")
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for block in content:
        if isinstance(block, dict) and block.get("type") in ("reasoning", "thinking"):
            text = block.get("text") or block.get("reasoning") or ""
            if text:
                parts.append(str(text))
    return "".join(parts).strip()


async def call_model(
    llm: Any,
    messages: list[Any],
    *,
    stream_final: bool = False,
    node: str = "",
) -> tuple[Any, bool, str]:
    """Stream the model; return ``(message, streamed_to_ui, emitted_answer)``.

    While ``stream_final`` is on, answer/reasoning tokens stream as they arrive for
    prose rounds. If the round later becomes a tool call, any answer already pushed
    is returned in ``emitted_answer`` so the LLM node can flush the remainder
    before tool traces (narration → tools → final reply).
    """
    streamed = False
    emitted_answer = ""
    if cancel_requested():
        return AIMessage(content=""), False, ""
    try:
        gathered: Any = None
        is_tool_round = False
        emitted_reasoning = ""
        async for chunk in llm.astream(messages):
            if cancel_requested():
                break
            gathered = chunk if gathered is None else gathered + chunk
            if _has_tool_signal(chunk, gathered):
                is_tool_round = True
            elif stream_final and not is_tool_round:
                answer_delta = extract_answer_text(chunk)
                if answer_delta:
                    stream_token(answer_delta, node=node)
                    emitted_answer += answer_delta
                    streamed = True
                # Reasoning may arrive as deltas or as a growing cumulative string.
                reason_piece = extract_reasoning_text(chunk)
                if reason_piece:
                    if reason_piece.startswith(emitted_reasoning):
                        delta = reason_piece[len(emitted_reasoning) :]
                        emitted_reasoning = reason_piece
                    else:
                        delta = reason_piece
                        emitted_reasoning += reason_piece
                    if delta:
                        stream_reasoning(delta, node=node)
                        streamed = True
            if cancel_requested():
                break
        if gathered is not None:
            return _coerce_ai_message(gathered), streamed, emitted_answer
        if cancel_requested():
            return AIMessage(content=emitted_answer or ""), streamed, emitted_answer
    except Exception as exc:
        cause = exc.__cause__ or exc.__context__
        logger.warning(
            "astream failed; falling back to ainvoke: %s%s",
            exc,
            f" ({type(cause).__name__})" if cause else "",
        )

    if cancel_requested():
        return AIMessage(content=emitted_answer or ""), streamed, emitted_answer
    response = _coerce_ai_message(await llm.ainvoke(messages))
    streamed = False
    emitted_answer = ""
    if stream_final and not (getattr(response, "tool_calls", None) or []):
        reason = message_reasoning(response)
        text = message_text(response)
        if reason:
            stream_reasoning(reason, node=node)
            streamed = True
        if text:
            stream_token(text, node=node)
            emitted_answer = text
            streamed = True
    return response, streamed, emitted_answer


_TRACE_ARG_LIMIT = 200


_EDIT_PREVIEW_KEYS = frozenset({"old", "new"})
_EDIT_PREVIEW_LIMIT = 400


def _preview_text(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    return value[: limit].rstrip() + "…"


def trace_args(args: dict[str, Any]) -> dict[str, Any]:
    """Keep large payloads out of live trace cards; keep edit previews readable."""
    out: dict[str, Any] = {}
    for key, value in args.items():
        if key in _EDIT_PREVIEW_KEYS and isinstance(value, str):
            out[key] = _preview_text(value, _EDIT_PREVIEW_LIMIT)
        elif isinstance(value, str) and len(value) > _TRACE_ARG_LIMIT:
            out[key] = f"（{len(value)} 字）"
        elif key == "files" and isinstance(value, list):
            slim: list[dict[str, Any]] = []
            for item in value:
                if not isinstance(item, dict):
                    continue
                path = str(item.get("path") or "").strip()
                body = item.get("content")
                entry: dict[str, Any] = {"path": path}
                if isinstance(body, str):
                    entry["content"] = f"（{len(body)} 字）"
                slim.append(entry)
            out[key] = slim
        else:
            out[key] = value
    return out


LAST_ROUND_NUDGE = (
    "\n\n【系统】工具轮次即将用尽。下一轮必须直接用中文回复用户，不要再调用任何工具。"
)


def _truncate_observation(value: Any) -> str:
    text = str(value)
    if len(text) <= _OBS_LIMIT:
        return text
    return text[:_OBS_LIMIT].rstrip() + f"\n…（已截断，原文 {len(text)} 字）"


def _call_name(call: Any) -> str:
    if isinstance(call, dict):
        return str(call.get("name") or "")
    return str(getattr(call, "name", "") or "")


def _call_args(call: Any) -> dict[str, Any]:
    if isinstance(call, dict):
        raw = call.get("args") or call.get("arguments") or {}
    else:
        raw = getattr(call, "args", None) or {}
    return raw if isinstance(raw, dict) else {"input": raw}


def _call_id(call: Any) -> str:
    if isinstance(call, dict):
        return str(call.get("id") or "")
    return str(getattr(call, "id", None) or "")


call_name = _call_name
call_args = _call_args
call_id = _call_id


def plan_write_dest(catalog: set[str]) -> str:
    if "update_plan" in catalog:
        return "update_plan"
    return "write_plan"


def _unbound_result(call: Any, catalog: set[str]) -> dict[str, Any]:
    name = _call_name(call)
    return {
        "name": name,
        "args": _call_args(call),
        "error": catalog_miss_message(name, catalog),
        "ok": False,
        "call_id": _call_id(call),
    }


def held_user_choice(
    calls: list[Any],
    hold_tools: frozenset[str],
) -> dict[str, Any] | None:
    if not hold_tools:
        return None
    for call in calls:
        if _call_name(call) in hold_tools:
            from app.agent.tools.choice import pending_from_user_choice_call

            return pending_from_user_choice_call(call)
    return None


def stamp_held_choice(message: Any, pending: dict[str, Any]) -> Any:
    if not pending or not isinstance(message, AIMessage):
        return message
    from app.agent.tools.choice import rebuild_ai

    extra = dict(getattr(message, "additional_kwargs", None) or {})
    extra.pop("parts", None)
    questions = pending.get("questions") or []
    if questions:
        extra["plan_questions"] = questions
    return rebuild_ai(message, extra=extra)


def split_hold_calls(
    calls: list[Any], hold_tools: frozenset[str]
) -> tuple[list[Any], list[Any]]:
    held: list[Any] = []
    rest: list[Any] = []
    for call in calls:
        if hold_tools and _call_name(call) in hold_tools:
            held.append(call)
        else:
            rest.append(call)
    return held, rest


def _emit_bound_trace_start(
    call: Any,
    *,
    trace_agent: str,
    trace_kind_for: Optional[Callable[[str], str]],
    messages: list[Any],
    events: list[dict[str, Any]],
) -> str:
    name = _call_name(call) or "tool"
    raw_args = _call_args(call)
    call_id = _call_id(call)
    tid = new_trace_id()
    kind = trace_kind_for(name) if trace_kind_for else "tool"
    emit_trace_start(
        trace_agent,
        tid,
        name,
        trace_args(raw_args),
        kind=kind,
    )
    events.append(
        tool_call_event(
            call_id=call_id or tid,
            name=name,
            input=raw_args,
            after_human=human_count(messages),
        )
    )
    return tid


def _record_unbound_events(
    call: Any,
    result: dict[str, Any],
    *,
    messages: list[Any],
    events: list[dict[str, Any]],
) -> None:
    """Catalog miss: persist the miss, skip live write traces and Permission."""
    humans = human_count(messages)
    call_id = _call_id(call) or result.get("call_id") or new_trace_id()
    events.append(
        tool_call_event(
            call_id=str(call_id),
            name=_call_name(call) or "tool",
            input=_call_args(call),
            after_human=humans,
        )
    )
    events.append(
        tool_result_event(
            call_id=str(call_id),
            outcome="error",
            content=str(result.get("error") or "tool failed"),
            after_human=humans,
        )
    )


async def run_tool_batch(
    calls: list[Any],
    tools: list[Any],
    *,
    execute_calls: Any,
    trace_agent: str,
    trace_kind_for: Optional[Callable[[str], str]],
    messages: list[Any],
    events: list[dict[str, Any]],
    permissions: list[Any],
) -> list[dict[str, Any]]:
    """Execute this batch (Permission first). Records Events. Does not append messages.

    ``permissions`` is required: decide them in ``permission_gate`` (or
    :func:`decide_permissions`) so this helper never silently auto-accepts.
    """
    catalog = catalog_names(tools)
    step_results: list[dict[str, Any] | None] = [None] * len(calls)
    bound: list[tuple[int, Any]] = []
    for index, call in enumerate(calls):
        name = _call_name(call)
        if catalog and name not in catalog:
            result = _unbound_result(call, catalog)
            step_results[index] = result
            _record_unbound_events(call, result, messages=messages, events=events)
        else:
            bound.append((index, call))

    bound_calls = [call for _, call in bound]
    pending_ids: list[str] = []
    for _, call in bound:
        pending_ids.append(
            _emit_bound_trace_start(
                call,
                trace_agent=trace_agent,
                trace_kind_for=trace_kind_for,
                messages=messages,
                events=events,
            )
        )

    humans = human_count(messages)

    run_calls = [call for call, perm in zip(bound_calls, permissions) if perm.execute]
    if run_calls:
        if execute_calls is not None:
            ran = await execute_calls(run_calls, tools)
        else:
            ran = await execute_tool_calls(run_calls, tools)
    else:
        ran = []
    ran_iter = iter(ran)
    bound_results: list[dict[str, Any]] = []
    for call, perm in zip(bound_calls, permissions):
        if perm.execute:
            bound_results.append(next(ran_iter))
        else:
            bound_results.append(perm.skipped_execution(call))

    for (index, call), tid, result in zip(bound, pending_ids, bound_results):
        name = _call_name(call)
        if name == PROPOSE_RULE_TOOL and result.get("ok"):
            payload = normalize_proposal_args(_call_args(call) or result.get("args"))
            if already_proposed_this_turn(events, humans):
                result = {
                    **result,
                    "ok": False,
                    "error": DUPLICATE_PROPOSAL,
                    "result": DUPLICATE_PROPOSAL,
                }
            elif payload["name"] and (
                payload["operation"] == "delete" or payload["details"]
            ):
                events.append(
                    rule_proposal_event(
                        proposal_id=tid,
                        scope=payload["scope"],
                        operation=payload["operation"],
                        name=payload["name"],
                        details=payload["details"],
                        after_human=humans,
                    )
                )
        outcome = result_outcome(result)
        ok = outcome == "success"
        emit_trace_end(
            trace_agent,
            tid,
            "success" if ok else "error",
            result=str(result.get("result")) if ok else None,
            error=None if ok else str(result.get("error") or result.get("result") or "tool failed"),
        )
        call_id = _call_id(call) or result.get("call_id") or tid
        events.append(
            tool_result_event(
                call_id=str(call_id),
                outcome=outcome,  # type: ignore[arg-type]
                content=str(
                    result.get("result")
                    if ok or result.get("permission_outcome")
                    else result.get("error") or "tool failed"
                ),
                after_human=humans,
            )
        )
        step_results[index] = result

    return [item for item in step_results if item is not None]


def tool_messages_for(step_results: list[dict[str, Any]], *, nudge: str = "") -> list[Any]:
    out: list[Any] = []
    for result in step_results:
        if result.get("permission_outcome"):
            observation = result.get("result")
        elif result.get("ok"):
            observation = result.get("result")
        else:
            observation = {"error": result.get("error", "tool failed")}
        out.append(
            ToolMessage(
                content=_truncate_observation(observation) + nudge,
                tool_call_id=result.get("call_id") or result["name"],
            )
        )
    return out


