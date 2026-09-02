"""LLM node: call the model, then hold / final-answer / pending-tools."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage

from app.agent.cancel import cancel_requested
from app.agent.helpers import persist_transcript, stream_token
from app.agent.loop import (
    call_id,
    call_model,
    call_name,
    held_user_choice,
    message_reasoning,
    message_text,
    plan_write_dest,
    split_hold_calls,
    stamp_held_choice,
)
from app.agent.plan.chat_contract import bounce_plan_chat, is_plan_chat_violation
from app.agent.runtime import (
    bind_profile_llm,
    capture_scratch,
    composed_profile,
    keep_held_choice,
    resolve_profile,
)
from app.agent.tools import tools_for_state
from app.agent.tools.catalog import catalog_names
from app.conversations.events import human_count, user_choice_event
from app.state import AgentState

from ._scratch import call_as_dict, request, scratch


def _without_tool_calls(message: Any) -> Any:
    """Drop tool_calls so a cancelled stream cannot persist a half-built call."""
    calls = getattr(message, "tool_calls", None) or []
    invalid = getattr(message, "invalid_tool_calls", None) or []
    if not calls and not invalid:
        return message
    if not isinstance(message, AIMessage):
        return message
    return AIMessage(
        content=message.content,
        additional_kwargs=dict(message.additional_kwargs or {}),
        response_metadata=dict(getattr(message, "response_metadata", None) or {}),
        id=message.id,
    )


def _stream_preamble_remainder(
    text: str,
    *,
    profile: Any,
    emitted_answer: str,
    preambles: list[str],
) -> None:
    remainder = text
    if (not profile.enforce_plan_chat) and emitted_answer:
        if text.startswith(emitted_answer):
            remainder = text[len(emitted_answer) :]
        else:
            remainder = ""
    if remainder:
        stream_token(remainder, node=profile.node)
    preambles.append(text)


def _hold_result(
    *,
    profile: Any,
    held: dict[str, Any],
    unused_holds: list[Any],
    sibling_calls: list[Any],
    response: Any,
    text: str,
    reason: str,
    preambles: list[str],
    emitted_answer: str,
    streamed: bool,
    next_request: list[Any],
    current: dict[str, Any],
    round_i: int,
) -> dict:
    if text:
        _stream_preamble_remainder(
            text, profile=profile, emitted_answer=emitted_answer, preambles=preambles
        )
    response = stamp_held_choice(response, held)
    events = [
        user_choice_event(
            choice_id=str(held.get("tool_call_id") or held.get("id") or "pending-choice"),
            pending=held,
            after_human=human_count(next_request),
        )
    ]
    persist: list[Any] = [response]
    next_request.append(response)
    unused_msgs = [
        ToolMessage(
            content="未使用：同 Step 只处理一条 User Choice。",
            tool_call_id=call_id(call) or call_name(call),
        )
        for call in unused_holds
    ]
    persist.extend(unused_msgs)
    next_request.extend(unused_msgs)
    persist = persist_transcript(
        persist,
        answer="",
        reasoning=reason,
        preamble="\n\n".join(preambles).strip(),
    )
    persist = keep_held_choice(persist, held)
    current = capture_scratch(
        current,
        round=round_i + 1,
        preambles=preambles,
        reasoning=reason,
        pending_calls=[call_as_dict(c) for c in sibling_calls],
        retry=False,
        streamed=streamed,
        emitted_answer=emitted_answer,
        answer="",
    )
    return {
        "turn_request": next_request,
        "turn_scratch": current,
        "messages": persist,
        "events": events,
        "pending_user_choice": held,
    }


def _final_or_bounce(
    *,
    profile: Any,
    tools: list[Any],
    response: Any,
    text: str,
    reason: str,
    preambles: list[str],
    streamed: bool,
    remaining_after: int,
    next_request: list[Any],
    current: dict[str, Any],
    round_i: int,
) -> dict:
    if (
        profile.enforce_plan_chat
        and is_plan_chat_violation(text)
        and remaining_after > 0
    ):
        dest = plan_write_dest(catalog_names(tools))
        next_request.append(SystemMessage(content=bounce_plan_chat(text, dest)))
        current = capture_scratch(
            current,
            round=round_i + 1,
            retry=True,
            pending_calls=[],
            reasoning=reason,
        )
        return {"turn_request": next_request, "turn_scratch": current}

    drop_chat = profile.enforce_plan_chat and is_plan_chat_violation(text)
    if not drop_chat:
        if (not profile.enforce_plan_chat and not streamed) or (
            profile.enforce_plan_chat and text
        ):
            if reason and not streamed:
                from app.agent.helpers import stream_reasoning

                stream_reasoning(reason, node=profile.node)
            if text and not streamed:
                stream_token(text, node=profile.node)
        persist = persist_transcript(
            [response],
            answer=text,
            reasoning=reason,
            preamble="\n\n".join(preambles).strip(),
        )
        next_request.append(response)
        current = capture_scratch(
            current,
            round=round_i + 1,
            preambles=preambles,
            answer=text,
            reasoning=reason,
            pending_calls=[],
            retry=False,
            streamed=streamed,
        )
        return {
            "turn_request": next_request,
            "turn_scratch": current,
            "messages": persist,
            "pending_user_choice": {},
        }
    current = capture_scratch(
        current,
        round=round_i + 1,
        answer="",
        reasoning=reason,
        pending_calls=[],
        retry=False,
    )
    return {
        "turn_request": next_request,
        "turn_scratch": current,
        "pending_user_choice": {},
    }


def _pending_tools_result(
    *,
    profile: Any,
    calls: list[Any],
    response: Any,
    text: str,
    reason: str,
    preambles: list[str],
    emitted_answer: str,
    streamed: bool,
    next_request: list[Any],
    current: dict[str, Any],
    round_i: int,
) -> dict:
    if text:
        _stream_preamble_remainder(
            text, profile=profile, emitted_answer=emitted_answer, preambles=preambles
        )
    persist = persist_transcript(
        [response],
        answer="",
        reasoning=reason,
        preamble="\n\n".join(preambles).strip(),
    )
    next_request.append(response)
    current = capture_scratch(
        current,
        round=round_i + 1,
        preambles=preambles,
        reasoning=reason,
        pending_calls=[call_as_dict(c) for c in calls],
        retry=False,
        streamed=streamed,
        emitted_answer=emitted_answer,
        answer="",
    )
    return {
        "turn_request": next_request,
        "turn_scratch": current,
        "messages": persist,
        "pending_user_choice": {},
    }


async def agent_llm(state: AgentState) -> dict:
    profile = composed_profile(state, resolve_profile(state))
    tools = tools_for_state(state, profile.mode)
    llm, tools = bind_profile_llm(profile, tools)

    current = scratch(state)
    llm_request = request(state)
    round_i = int(current.get("round") or 0)
    max_rounds = max(1, int(current.get("max_rounds") or profile.max_rounds))
    remaining_after = max_rounds - round_i - 1

    response, streamed, emitted_answer = await call_model(
        llm,
        llm_request,
        stream_final=not profile.enforce_plan_chat,
        node=profile.node,
    )
    if cancel_requested():
        response = _without_tool_calls(response)
    calls = getattr(response, "tool_calls", None) or []
    text = message_text(response)
    reason = message_reasoning(response)
    preambles = list(current.get("preambles") or [])
    next_request = list(llm_request)

    held_calls, sibling_calls = split_hold_calls(calls, profile.hold_tools)
    unused_holds = held_calls[1:]
    held_calls = held_calls[:1]
    held = held_user_choice(held_calls, profile.hold_tools)

    if held is not None:
        return _hold_result(
            profile=profile,
            held=held,
            unused_holds=unused_holds,
            sibling_calls=sibling_calls,
            response=response,
            text=text,
            reason=reason,
            preambles=preambles,
            emitted_answer=emitted_answer,
            streamed=streamed,
            next_request=next_request,
            current=current,
            round_i=round_i,
        )

    if not calls or not tools:
        return _final_or_bounce(
            profile=profile,
            tools=tools,
            response=response,
            text=text,
            reason=reason,
            preambles=preambles,
            streamed=streamed,
            remaining_after=remaining_after,
            next_request=next_request,
            current=current,
            round_i=round_i,
        )

    return _pending_tools_result(
        profile=profile,
        calls=calls,
        response=response,
        text=text,
        reason=reason,
        preambles=preambles,
        emitted_answer=emitted_answer,
        streamed=streamed,
        next_request=next_request,
        current=current,
        round_i=round_i,
    )
