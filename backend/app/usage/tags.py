"""Derive studio call tags and tool entries from runtime context.

Call tags are stored with usage rows. Tool tags are only attached when a
tool is invoked — never when it is merely offered.
"""

from __future__ import annotations

from typing import Any, Iterable

TAG_COMPACT = "compact"
TAG_PLAN = "plan"
TAG_ASK = "ask"
TAG_UTILITY = "utility"
TAG_MUTATION = "mutation"

MUTATION_TOOLS = frozenset(
    {
        "workspace_write",
        "workspace_search_replace",
        "workspace_delete",
    }
)

_CALL_TAG_ORDER = (TAG_COMPACT, TAG_PLAN, TAG_ASK, TAG_UTILITY)


def call_tags(
    *,
    mode: str = "",
    role: str = "",
    raw_tags: Iterable[str] | None = None,
) -> list[str]:
    """Closed vocabulary: compact, plan, ask, utility. No first_* tags."""
    incoming = [str(t) for t in (raw_tags or []) if t]
    role_key = (role or "").strip().lower()
    mode_key = (mode or "").strip().lower()
    found: set[str] = set()

    if mode_key == TAG_PLAN or TAG_PLAN in incoming or role_key == TAG_PLAN:
        found.add(TAG_PLAN)
    if mode_key == TAG_ASK or TAG_ASK in incoming or role_key == TAG_ASK:
        found.add(TAG_ASK)

    compact = (
        TAG_COMPACT in incoming
        or role_key in {TAG_COMPACT, "compaction"}
        or any(t == "role:compaction" or t.endswith(":compaction") for t in incoming)
    )
    if compact:
        found.add(TAG_COMPACT)
        found.add(TAG_UTILITY)

    if TAG_UTILITY in incoming or role_key == TAG_UTILITY:
        found.add(TAG_UTILITY)

    return [tag for tag in _CALL_TAG_ORDER if tag in found]


def tool_name_from_def(item: Any) -> str:
    if isinstance(item, str):
        return item.strip()
    if not isinstance(item, dict):
        name = getattr(item, "name", None) or getattr(item, "id", None)
        return str(name or "").strip()
    fn = item.get("function") if isinstance(item.get("function"), dict) else None
    for candidate in (
        item.get("name"),
        (fn or {}).get("name"),
        item.get("id"),
    ):
        text = str(candidate or "").strip()
        if text:
            return text
    return ""


def tools_offered(tool_defs: Any) -> list[dict[str, Any]]:
    """Names of tools included in this request. No mutation tags."""
    if not tool_defs:
        return []
    batch = tool_defs if isinstance(tool_defs, list) else [tool_defs]
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in batch:
        name = tool_name_from_def(item)
        if not name or name in seen:
            continue
        seen.add(name)
        out.append({"name": name, "tags": []})
    return out


def tools_invoked(tool_calls: Any) -> list[dict[str, Any]]:
    """Tools the model chose. mutation only on write workspace tools."""
    if not tool_calls:
        return []
    batch = tool_calls if isinstance(tool_calls, list) else [tool_calls]
    out: list[dict[str, Any]] = []
    for item in batch:
        name = tool_name_from_def(item)
        if not name:
            continue
        tags = [TAG_MUTATION] if name in MUTATION_TOOLS else []
        out.append({"name": name, "tags": tags})
    return out


def compaction_invoke_config() -> dict[str, Any]:
    """Merged into the current runnable config so graph callbacks still apply."""
    from langchain_core.runnables.config import ensure_config

    return ensure_config(
        {
            "tags": ["role:compaction", TAG_COMPACT, TAG_UTILITY],
            "metadata": {"role": "compaction"},
        }
    )
