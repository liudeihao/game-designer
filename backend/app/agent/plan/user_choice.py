"""Resolve a frozen User Choice. This node is the only place those tools interrupt."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import SystemMessage, ToolMessage
from langgraph.types import interrupt

from app.agent.helpers import emit
from app.agent.tools.choice import (
    answer_items_from_pending,
    interrupt_payload,
    is_suggest_mode,
    mode_switch_accepted,
    observation_from_pending,
    patch_answered_ai,
    suggested_mode,
)
from app.agent.tools.deps import PLAN, normalize_mode
from app.agent.tools.mode import SUGGEST_MODE_TOOL, mode_label
from app.agent.tools.plan_panel import ASK_USER_TOOL
from app.conversations.events import human_count, user_choice_event
from app.state import AgentState


# Resume assembles its last human message from `instruction` plus the workspace
# card. Left empty, that message is the card alone — a full copy of the current
# plan sitting closer to the model than the answers it is supposed to act on.
CHOICE_RESUME_INSTRUCTION = "用户刚回答了上面的澄清问题，请据此继续本轮工作。"
PLAN_CHOICE_RESUME_INSTRUCTION = (
    "用户刚回答了上面的澄清问题。请据此更新右侧 plan："
    "把「待敲定的设计点」里已确定的条目改写为 `- [x] 问题（用户结论一句话）`，"
    "并据此修正目标 / 非目标 / 拟处理文档范围。仍缺关键方向才继续提问。"
)


def _is_plan_bound(state: AgentState) -> bool:
    return normalize_mode(state.get("mode")) == PLAN


def _resume_instruction(pending: dict[str, Any], *, plan_bound: bool) -> str:
    """Only ask_user owes an action; suggest_mode just needs a reply."""
    if str(pending.get("variant") or "") != "questions":
        return ""
    return PLAN_CHOICE_RESUME_INSTRUCTION if plan_bound else CHOICE_RESUME_INSTRUCTION


def after_user_choice(state: AgentState) -> str:
    """Resume the in-flight ReAct loop when possible; rebuild on mode change."""
    scratch = dict(state.get("turn_scratch") or {})
    if scratch.get("rebuild_turn") or not (state.get("turn_request") or []):
        return "turn_setup"
    return "agent_llm"


async def user_choice(state: AgentState) -> dict:
    pending = dict(state.get("pending_user_choice") or {})
    if not pending.get("type") and not pending.get("questions"):
        return {"pending_user_choice": {}, "instruction": ""}

    result = interrupt(interrupt_payload(pending))
    observation = observation_from_pending(pending, result)
    items = answer_items_from_pending(pending, result)
    call_id = str(pending.get("tool_call_id") or ASK_USER_TOOL)
    patched = patch_answered_ai(list(state.get("messages") or []), pending, items)
    messages: list = []
    if patched is not None:
        messages.append(patched)
    tool_msg = ToolMessage(content=observation, tool_call_id=call_id)
    messages.append(tool_msg)
    plan_bound = _is_plan_bound(state)
    instruction = _resume_instruction(pending, plan_bound=plan_bound)
    switching = is_suggest_mode(pending) and mode_switch_accepted(result)
    dest_mode = suggested_mode(pending) if switching else ""
    request = list(state.get("turn_request") or [])
    if request:
        request.append(tool_msg)
        if instruction and not switching:
            request.append(SystemMessage(content=instruction))
    scratch = dict(state.get("turn_scratch") or {})
    scratch["rebuild_turn"] = bool(switching) or not request
    payload: dict = {
        "messages": messages,
        "events": [
            user_choice_event(
                choice_id=call_id,
                pending=pending,
                status="answered",
                answers=items,
                after_human=human_count(state.get("messages") or []),
            )
        ],
        "pending_user_choice": {},
        "instruction": instruction,
        "turn_request": request,
        "turn_scratch": scratch,
    }
    if switching:
        payload["mode"] = dest_mode
        payload["activity"] = [
            emit(
                "Agent",
                "route",
                f"用户选择切换到 {mode_label(dest_mode)} 模式。",
                {"route": SUGGEST_MODE_TOOL, "mode": dest_mode},
            )
        ]
    return payload
