"""Normalize a propose_rule Tool Call into a Rule Proposal payload."""

from __future__ import annotations

from typing import Any

from ._store import OPS, SCOPES

PROPOSE_RULE_TOOL = "propose_rule"
DUPLICATE_PROPOSAL = "同一轮只能出示一条 Rule Proposal。不要重试。"

_LEGACY_OPS = {"append": "add", "replace": "update", "clear": "delete"}


def normalize_proposal_args(args: dict[str, Any] | None) -> dict[str, str]:
    raw = args if isinstance(args, dict) else {}
    scope = str(raw.get("scope") or "project").strip().lower()
    if scope not in SCOPES:
        scope = "project"
    operation = str(raw.get("operation") or "add").strip().lower()
    operation = _LEGACY_OPS.get(operation, operation)
    if operation not in OPS:
        operation = "add"
    name = str(raw.get("name") or "").strip()
    details = str(raw.get("details") if raw.get("details") is not None else raw.get("text") or "")
    if operation != "delete":
        details = details.strip()
    return {"scope": scope, "operation": operation, "name": name, "details": details}


def already_proposed_this_turn(events: list[dict[str, Any]], after_human: int) -> bool:
    human = int(after_human or 0)
    return any(
        item.get("type") == "rule_proposal" and int(item.get("after_human") or 0) == human
        for item in events
    )
