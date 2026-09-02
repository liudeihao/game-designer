"""Context-window usage for the UI.

Prefer the latest LLM call's provider-reported ``input_tokens``. Fall back to a
local projection when the conversation has no recorded calls yet.
"""

from __future__ import annotations

import json
from typing import Any

from app.memory.formatting import format_messages_for_summary
from app.memory.tokens import (
    estimate_messages_tokens,
    estimate_tokens,
    resolve_context_limit,
)
from app.agent.tools import describe_tools
from app.docs import workspace_card
from app.agent.plan.prompts import PLAN_SYSTEM_PROMPT
from app.agent.studio.prompts import ASK_AGENT_SYSTEM, MAIN_AGENT_SYSTEM

from app.rules import format_rule_sections, read_project_rules, read_user_rules

_MEASURED_CATEGORY_META = (
    ("system", "System", "#3B82F6"),
    ("rules", "Rules", "#A855F7"),
    ("tools", "Tools", "#F59E0B"),
    ("conversation", "Conversation", "#06B6D4"),
    ("other", "Other", "#94A3B8"),
)


def _category(id_: str, label: str, tokens: int, color: str) -> dict[str, Any]:
    return {
        "id": id_,
        "label": label,
        "tokens": max(0, int(tokens)),
        "color": color,
    }


def _mode_key(mode: str) -> str:
    if mode == "plan":
        return "plan"
    if mode == "ask":
        return "ask"
    return ""


def _workspace_context_text(workspace_value: Any) -> str:
    if isinstance(workspace_value, dict) and "files" in workspace_value:
        files = workspace_value.get("files")
        if isinstance(files, dict):
            return workspace_card(files)
    return workspace_card(workspace_value if isinstance(workspace_value, dict) else {})


async def _tools_text() -> str:
    try:
        tools = describe_tools()
    except Exception:
        tools = []
    if not tools:
        return ""
    return json.dumps(tools, ensure_ascii=False)


def context_usage_from_call(
    call: dict[str, Any],
    *,
    mode: str = "",
    model: str | None = None,
    provider_id: str = "",
) -> dict[str, Any] | None:
    input_tokens = int(call.get("input_tokens") or 0)
    if input_tokens <= 0:
        return None
    mode_key = _mode_key(mode)
    model_name = (model or "").strip() or str(call.get("model") or "")
    pid = (provider_id or "").strip() or str(call.get("provider_id") or "")
    context_limit = resolve_context_limit(model_name, provider_id=pid)
    breakdown = call.get("input_breakdown") or {}
    if not isinstance(breakdown, dict):
        breakdown = {}
    categories = [
        _category(cid, label, int(breakdown.get(cid, 0) or 0), color)
        for cid, label, color in _MEASURED_CATEGORY_META
    ]
    categorized = sum(c["tokens"] for c in categories)
    if categorized != input_tokens:
        remainder = input_tokens - categorized
        if remainder > 0:
            other = next((c for c in categories if c["id"] == "other"), None)
            if other is not None:
                other["tokens"] += remainder
            else:
                categories.append(_category("other", "Other", remainder, "#94A3B8"))
        elif remainder < 0 and categorized > 0:
            for c in categories:
                c["tokens"] = int(c["tokens"] * input_tokens / categorized)
            drift = input_tokens - sum(c["tokens"] for c in categories)
            if drift and categories:
                categories[0]["tokens"] += drift

    source = call.get("usage_source") or "estimated"
    if source not in {"provider", "estimated"}:
        source = "estimated"
    percent = (
        round(min(100.0, (input_tokens / context_limit) * 100.0), 1) if context_limit else 0.0
    )
    return {
        "model": model_name,
        "mode": mode_key or None,
        "context_limit": context_limit,
        "total_tokens": input_tokens,
        "percent": percent,
        "categories": categories,
        "source": source,
        "call_id": call.get("id") or "",
        "role": call.get("role") or "",
    }


def measured_context_usage(
    conversation_id: str,
    *,
    mode: str = "",
    model: str | None = None,
    provider_id: str = "",
) -> dict[str, Any] | None:
    from app.store import db

    call = db.latest_llm_usage(conversation_id)
    if not call:
        return None
    return context_usage_from_call(call, mode=mode, model=model, provider_id=provider_id)


async def estimate_context_usage(
    *,
    messages: list[Any] | None,
    workspace_value: Any,
    mode: str = "",
    conversation_summary: str = "",
    model: str | None = None,
    provider_id: str = "",
    project_id: str = "",
) -> dict[str, Any]:
    mode_key = _mode_key(mode)
    context_limit = resolve_context_limit(model, provider_id=provider_id)

    if mode_key == "plan":
        system_text = PLAN_SYSTEM_PROMPT
    elif mode_key == "ask":
        system_text = ASK_AGENT_SYSTEM
    else:
        system_text = MAIN_AGENT_SYSTEM
    tools_text = await _tools_text()
    workspace_text = _workspace_context_text(workspace_value) if mode_key == "plan" else ""
    rules_text = format_rule_sections(
        read_user_rules(),
        read_project_rules(project_id) if project_id else [],
    )

    msgs = list(messages or [])
    conversation_tokens = estimate_messages_tokens(msgs, model=model)
    if (conversation_summary or "").strip():
        conversation_tokens += estimate_tokens(conversation_summary, model=model)

    categories = [
        _category("system", "System prompt", estimate_tokens(system_text, model=model), "#3B82F6"),
        _category("rules", "Rules", estimate_tokens(rules_text, model=model), "#A855F7"),
        _category("tools", "Tool definitions", estimate_tokens(tools_text, model=model), "#F59E0B"),
        _category(
            "workspace",
            "Workspace card",
            estimate_tokens(workspace_text, model=model),
            "#F97316",
        ),
        _category(
            "conversation",
            "Conversation",
            conversation_tokens,
            "#06B6D4",
        ),
    ]

    total = sum(c["tokens"] for c in categories)
    percent = round(min(100.0, (total / context_limit) * 100.0), 1) if context_limit else 0.0

    return {
        "model": model or "",
        "mode": mode_key or None,
        "context_limit": context_limit,
        "total_tokens": total,
        "percent": percent,
        "categories": categories,
        "source": "projected",
        "conversation_chars": len(format_messages_for_summary(msgs)),
    }


async def resolve_context_usage(
    *,
    conversation_id: str,
    messages: list[Any] | None,
    workspace_value: Any,
    mode: str = "",
    conversation_summary: str = "",
    model: str | None = None,
    provider_id: str = "",
    project_id: str = "",
) -> dict[str, Any]:
    measured = measured_context_usage(
        conversation_id, mode=mode, model=model, provider_id=provider_id
    )
    if measured is not None:
        return measured
    return await estimate_context_usage(
        messages=messages,
        workspace_value=workspace_value,
        mode=mode,
        conversation_summary=conversation_summary,
        model=model,
        provider_id=provider_id,
        project_id=project_id,
    )
