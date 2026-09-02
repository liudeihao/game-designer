"""Persist User Rule and Project Rule as named items."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from app import config
from app.memory.tokens import estimate_tokens
from app.docs import ensure_seeded, project_studio_dir

USER_RULES_NAME = "user-rules.json"
USER_RULES_LEGACY = "user-rules.md"
PROJECT_RULES_NAME = "rules.json"
PROJECT_RULES_LEGACY = "rules.md"
LEGACY_MIGRATED_NAME = "工作约定"
RULE_TOKEN_WARN = 2_000
OPS = frozenset({"add", "update", "delete"})
SCOPES = frozenset({"user", "project"})


def new_rule_id() -> str:
    return f"r_{uuid.uuid4().hex[:12]}"


def user_rules_path() -> Path:
    return config.data_dir() / USER_RULES_NAME


def user_rules_legacy_path() -> Path:
    return config.data_dir() / USER_RULES_LEGACY


def project_rules_path(project_id: str) -> Path:
    return project_studio_dir(project_id) / PROJECT_RULES_NAME


def project_rules_legacy_path(project_id: str) -> Path:
    return project_studio_dir(project_id) / PROJECT_RULES_LEGACY


def normalize_rule_items(raw: Any) -> list[dict[str, str]]:
    seq = raw if isinstance(raw, list) else []
    out: list[dict[str, str]] = []
    seen_ids: set[str] = set()
    for item in seq:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        details = str(item.get("details") or "").strip()
        rid = str(item.get("id") or "").strip() or new_rule_id()
        while rid in seen_ids:
            rid = new_rule_id()
        seen_ids.add(rid)
        out.append({"id": rid, "name": name, "details": details})
    return out


def parse_rules_for_save(raw: Any) -> list[dict[str, str]]:
    if raw is None:
        raw = []
    if not isinstance(raw, list):
        raise ValueError("rules must be a list")
    items: list[dict[str, str]] = []
    seen_names: set[str] = set()
    seen_ids: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("each rule must be an object")
        name = str(item.get("name") or "").strip()
        if not name:
            raise ValueError("每条 Rule 必须有名称")
        if name in seen_names:
            raise ValueError(f"Rule 名称重复: {name}")
        seen_names.add(name)
        details = str(item.get("details") or "").strip()
        rid = str(item.get("id") or "").strip() or new_rule_id()
        while rid in seen_ids:
            rid = new_rule_id()
        seen_ids.add(rid)
        items.append({"id": rid, "name": name, "details": details})
    return items


def _write_items(path: Path, items: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"rules": normalize_rule_items(items)}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _parse_json_file(path: Path) -> list[dict[str, str]]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError):
        return []
    if isinstance(raw, dict):
        return normalize_rule_items(raw.get("rules"))
    if isinstance(raw, list):
        return normalize_rule_items(raw)
    return []


def _read_items(json_path: Path, legacy_path: Path) -> list[dict[str, str]]:
    if json_path.is_file():
        return _parse_json_file(json_path)
    if legacy_path.is_file():
        text = legacy_path.read_text(encoding="utf-8").strip()
        if text:
            items = [
                {"id": new_rule_id(), "name": LEGACY_MIGRATED_NAME, "details": text}
            ]
            _write_items(json_path, items)
            return _parse_json_file(json_path)
    return []


def read_user_rules() -> list[dict[str, str]]:
    return _read_items(user_rules_path(), user_rules_legacy_path())


def write_user_rules(items: list[dict[str, str]] | None) -> None:
    _write_items(user_rules_path(), parse_rules_for_save(items or []))


def read_project_rules(project_id: str) -> list[dict[str, str]]:
    pid = (project_id or "").strip()
    if not pid:
        return []
    return _read_items(project_rules_path(pid), project_rules_legacy_path(pid))


def write_project_rules(project_id: str, items: list[dict[str, str]] | None) -> None:
    pid = (project_id or "").strip()
    if not pid:
        raise ValueError("project_id required")
    ensure_seeded(pid)
    _write_items(project_rules_path(pid), parse_rules_for_save(items or []))


def apply_rule_op(
    current: list[dict[str, str]] | None,
    operation: str,
    name: str,
    details: str = "",
) -> list[dict[str, str]]:
    op = (operation or "").strip().lower()
    if op not in OPS:
        raise ValueError(f"unknown rule operation: {operation}")
    title = (name or "").strip()
    body = (details or "").strip()
    items = [dict(item) for item in (current or [])]
    if op == "delete":
        if not title:
            return items
        return [item for item in items if item.get("name") != title]
    if not title:
        raise ValueError("Rule 必须有名称")
    if not body:
        raise ValueError("add / update 必须提供详情")
    for index, item in enumerate(items):
        if item.get("name") == title:
            items[index] = {**item, "name": title, "details": body}
            return items
    items.append({"id": new_rule_id(), "name": title, "details": body})
    return items


def _token_text(items: list[dict[str, str]]) -> str:
    parts: list[str] = []
    for item in items:
        name = (item.get("name") or "").strip()
        details = (item.get("details") or "").strip()
        if name and details:
            parts.append(f"{name}\n{details}")
        elif name or details:
            parts.append(name or details)
    return "\n\n".join(parts)


def rule_payload(items: list[dict[str, str]] | None, *, model: str = "") -> dict[str, Any]:
    rules = normalize_rule_items(items or [])
    tokens = estimate_tokens(_token_text(rules), model=model)
    return {
        "rules": rules,
        "tokens": tokens,
        "warn": tokens >= RULE_TOKEN_WARN,
    }
