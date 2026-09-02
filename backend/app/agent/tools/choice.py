"""Freeze and resolve User Choice tool calls (ask_user / suggest_mode)."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage

from app.agent.tools.plan_panel import (
    ASK_USER_TOOL,
    USER_CHOICE_PENDING,
    answer_items_from_result,
    observation_from_answers,
    pending_from_ask_user_call,
)
from app.agent.tools.mode import (
    SUGGEST_MODE_TOOL,
    SUGGEST_MODE_VARIANT,
    default_message,
    mode_label,
    target_mode,
)

USER_CHOICE_HOLD_TOOLS = frozenset({ASK_USER_TOOL, SUGGEST_MODE_TOOL})


def _call_name(call: Any) -> str:
    if isinstance(call, dict):
        return str(call.get("name") or "")
    return str(getattr(call, "name", "") or "")


def _call_id(call: Any) -> str:
    if isinstance(call, dict):
        return str(call.get("id") or "")
    return str(getattr(call, "id", "") or "")


def _call_args(call: Any) -> dict[str, Any]:
    if isinstance(call, dict):
        args = call.get("args") or call.get("arguments") or {}
    else:
        args = getattr(call, "args", None) or {}
    return args if isinstance(args, dict) else {}


def pending_from_user_choice_call(call: Any) -> dict[str, Any]:
    name = _call_name(call)
    if name == SUGGEST_MODE_TOOL:
        args = _call_args(call)
        mode = target_mode(str(args.get("mode") or ""))
        return {
            "type": USER_CHOICE_PENDING,
            "variant": SUGGEST_MODE_VARIANT,
            "mode": mode,
            "message": str(args.get("message") or "").strip() or default_message(mode),
            "reason": str(args.get("reason") or ""),
            "tool_call_id": _call_id(call) or SUGGEST_MODE_TOOL,
        }
    return pending_from_ask_user_call(call)


def is_suggest_mode(pending: dict[str, Any]) -> bool:
    return str(pending.get("variant") or "") == SUGGEST_MODE_VARIANT


def suggested_mode(pending: dict[str, Any]) -> str:
    return target_mode(str(pending.get("mode") or ""))


def mode_switch_accepted(result: Any) -> bool:
    """Anything but an explicit switch leaves the conversation where it is."""
    return isinstance(result, dict) and result.get("action") == "switch"


def interrupt_payload(pending: dict[str, Any]) -> dict[str, Any]:
    skip = {"tool_call_id"}
    return {key: value for key, value in pending.items() if key not in skip}


def observation_from_pending(pending: dict[str, Any], result: Any) -> str:
    if is_suggest_mode(pending):
        label = mode_label(suggested_mode(pending))
        if mode_switch_accepted(result):
            return (
                f"用户同意切换到 {label} 模式。"
                "请用一句话确认，不要再改工作区。"
            )
        return (
            f"用户暂不切换到 {label} 模式。"
            "请继续用当前模式做得到的方式帮助用户。"
        )
    return observation_from_answers(list(pending.get("questions") or []), result)


def answer_items_from_pending(pending: dict[str, Any], result: Any) -> list[dict[str, str]]:
    if is_suggest_mode(pending):
        label = mode_label(suggested_mode(pending))
        answer = f"切换到 {label}" if mode_switch_accepted(result) else "暂不切换"
        return [{"prompt": "选择", "answer": answer}]
    return answer_items_from_result(list(pending.get("questions") or []), result)


def rebuild_ai(
    message: Any,
    *,
    tool_calls: list[Any] | None = None,
    extra: dict[str, Any] | None = None,
) -> AIMessage:
    calls = tool_calls if tool_calls is not None else list(getattr(message, "tool_calls", None) or [])
    kwargs = extra if extra is not None else dict(getattr(message, "additional_kwargs", None) or {})
    mid = getattr(message, "id", None)
    if not mid and calls:
        first = calls[0]
        first_id = first.get("id") if isinstance(first, dict) else getattr(first, "id", "")
        if first_id:
            mid = f"choice-{first_id}"
    rebuilt: dict[str, Any] = {
        "content": getattr(message, "content", "") or "",
        "additional_kwargs": kwargs,
        "id": mid,
    }
    if calls:
        rebuilt["tool_calls"] = calls
    return AIMessage(**rebuilt)


def patch_answered_ai(
    messages: list[Any],
    pending: dict[str, Any],
    answers: list[dict[str, str]],
) -> AIMessage | None:
    call_id = str(pending.get("tool_call_id") or "")
    for message in reversed(messages or []):
        if not isinstance(message, AIMessage):
            continue
        calls = list(getattr(message, "tool_calls", None) or [])
        ids = [
            str(c.get("id") if isinstance(c, dict) else getattr(c, "id", "") or "")
            for c in calls
        ]
        if call_id and call_id not in ids:
            continue
        extra = dict(getattr(message, "additional_kwargs", None) or {})
        extra.pop("parts", None)
        extra["answers"] = answers
        return rebuild_ai(message, extra=extra)
    return None
