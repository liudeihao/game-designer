"""Compose the stable system prefix with optional named Rule sections."""

from __future__ import annotations

from typing import Any


def _section(title: str, items: list[dict[str, Any]] | None) -> str:
    blocks: list[str] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        details = str(item.get("details") or "").strip()
        if not name and not details:
            continue
        if name and details:
            blocks.append(f"### {name}\n{details}")
        elif name:
            blocks.append(f"### {name}")
        else:
            blocks.append(details)
    if not blocks:
        return ""
    return f"## {title}\n" + "\n\n".join(blocks)


def format_rule_sections(
    user_rules: list[dict[str, Any]] | None = None,
    project_rules: list[dict[str, Any]] | None = None,
) -> str:
    parts: list[str] = []
    user = _section("User Rule", user_rules)
    project = _section("Project Rule", project_rules)
    if user:
        parts.append(user)
    if project:
        parts.append(project)
    return "\n\n".join(parts)


def split_system_and_rules(text: str) -> tuple[str, str]:
    """Peel ``## User Rule`` / ``## Project Rule`` off a composed system prompt."""
    body = text or ""
    starts: list[int] = []
    for heading in ("## User Rule", "## Project Rule"):
        if body.startswith(heading):
            starts.append(0)
            continue
        idx = body.find("\n" + heading)
        if idx >= 0:
            starts.append(idx + 1)
    if not starts:
        return body, ""
    cut = min(starts)
    return body[:cut].rstrip(), body[cut:].strip()


def compose_system_prompt(
    base: str,
    *,
    user_rules: list[dict[str, Any]] | None = None,
    project_rules: list[dict[str, Any]] | None = None,
) -> str:
    parts = [(base or "").rstrip()]
    rules = format_rule_sections(user_rules, project_rules)
    if rules:
        parts.append(rules)
    return "\n\n".join(p for p in parts if p)
