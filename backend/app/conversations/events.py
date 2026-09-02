"""Typed Event constructors. Message is not assembled here."""

from __future__ import annotations

from typing import Any, Literal

ToolResultOutcome = Literal["success", "error", "reject", "comment"]
UserChoiceStatus = Literal["pending", "answered", "dismissed"]
PermissionStatus = Literal["pending", "accepted", "rejected", "commented"]
RuleProposalStatus = Literal["pending", "accepted", "ignored"]


def _stamp(event: dict[str, Any], after_human: int | None) -> dict[str, Any]:
    if after_human is not None:
        event["after_human"] = after_human
    return event


def human_count(messages: list[Any] | None) -> int:
    return sum(1 for message in messages or [] if getattr(message, "type", "") == "human")


def tool_call_event(
    *,
    call_id: str,
    name: str,
    input: dict[str, Any] | None = None,
    after_human: int | None = None,
) -> dict[str, Any]:
    return _stamp(
        {
            "type": "tool_call",
            "id": call_id,
            "name": name,
            "input": dict(input or {}),
        },
        after_human,
    )


def tool_result_event(
    *,
    call_id: str,
    outcome: ToolResultOutcome,
    content: str = "",
    after_human: int | None = None,
) -> dict[str, Any]:
    return _stamp(
        {
            "type": "tool_result",
            "id": call_id,
            "outcome": outcome,
            "content": content,
        },
        after_human,
    )


def tool_permission_event(
    *,
    call_id: str,
    status: PermissionStatus,
    comment: str = "",
    after_human: int | None = None,
) -> dict[str, Any]:
    event: dict[str, Any] = {
        "type": "tool_permission",
        "id": call_id,
        "status": status,
    }
    if comment:
        event["comment"] = comment
    return _stamp(event, after_human)


def user_choice_event(
    *,
    choice_id: str,
    pending: dict[str, Any],
    status: UserChoiceStatus = "pending",
    answers: Any = None,
    after_human: int | None = None,
) -> dict[str, Any]:
    event: dict[str, Any] = {
        "type": "user_choice",
        "id": choice_id,
        "status": status,
        "pending": pending,
    }
    if answers is not None:
        event["answers"] = answers
    return _stamp(event, after_human)


def rule_proposal_event(
    *,
    proposal_id: str,
    scope: str,
    operation: str,
    name: str = "",
    details: str = "",
    text: str = "",
    status: RuleProposalStatus = "pending",
    after_human: int | None = None,
) -> dict[str, Any]:
    body = details or text
    return _stamp(
        {
            "type": "rule_proposal",
            "id": proposal_id,
            "scope": scope,
            "operation": operation,
            "name": name,
            "details": body,
            "status": status,
        },
        after_human,
    )


def events_from_state(values: dict[str, Any] | None) -> list[dict[str, Any]]:
    raw = (values or {}).get("events") or []
    return [dict(item) for item in raw if isinstance(item, dict)]
