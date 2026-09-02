"""Single tool registry. Visibility is a policy; implementations register here."""

from __future__ import annotations

from collections.abc import Callable, Collection
from dataclasses import dataclass, field
from typing import Any

from app.agent.tools.deps import CatalogView, ToolPolicy, normalize_mode

Visibility = Callable[[CatalogView], bool]
ToolSource = Callable[[], Any] | list[Any] | Any


@dataclass
class _Entry:
    modes: frozenset[str]
    tools: ToolSource
    visible: Visibility | None = None


@dataclass
class ToolRegistry:
    """Catalog of static tools. Nodes call tools_for; they do not concat lists."""

    _entries: list[_Entry] = field(default_factory=list)
    _ready: bool = False

    def add(
        self,
        *,
        modes: Collection[str],
        tools: ToolSource,
        visible: Visibility | None = None,
    ) -> None:
        self._entries.append(
            _Entry(modes=frozenset(modes), tools=tools, visible=visible)
        )

    def build_toolset(
        self,
        view: CatalogView,
        policy: ToolPolicy = "for_mode",
    ) -> list[Any]:
        key = normalize_mode(view.mode)
        view = CatalogView(mode=key, trigger=view.trigger, plan_exists=view.plan_exists)
        out: list[Any] = []
        names: set[str] = set()
        for entry in self._entries:
            if policy != "all" and key not in entry.modes:
                continue
            if entry.visible is not None and not entry.visible(view):
                continue
            built = entry.tools() if callable(entry.tools) else entry.tools
            if not built:
                continue
            batch = built if isinstance(built, list) else [built]
            for item in batch:
                name = getattr(item, "name", "") or ""
                if not name or name in names:
                    continue
                names.add(name)
                out.append(item)
        return out


default_registry = ToolRegistry()


def register_builtin_tools(registry: ToolRegistry | None = None) -> ToolRegistry:
    """Idempotent: tool modules register into the shared catalog."""
    target = registry if registry is not None else default_registry
    if target._ready:
        return target
    from app.agent.tools import mode, plan_panel, rule
    from app.agent.tools.docs import register as register_workspace

    register_workspace(target)
    plan_panel.register(target)
    mode.register(target)
    rule.register(target)
    target._ready = True
    return target


def tools_for(
    mode: str | None = None,
    *,
    trigger: str = "",
    plan_exists: bool = False,
    policy: ToolPolicy = "for_mode",
) -> list[Any]:
    """Bind the tool list for this catalog view."""
    view = CatalogView(
        mode=normalize_mode(mode),
        trigger=trigger,
        plan_exists=plan_exists,
    )
    return register_builtin_tools().build_toolset(view, policy)


def tools_for_state(
    state: dict[str, Any],
    mode: str | None = None,
    policy: ToolPolicy = "for_mode",
) -> list[Any]:
    """Bind tools from checkpointed state (mode, trigger, whether a plan exists)."""
    return tools_for(
        normalize_mode(mode if mode is not None else state.get("mode")),
        trigger=str(state.get("trigger") or ""),
        plan_exists=bool((state.get("plan_markdown") or "").strip()),
        policy=policy,
    )


def describe_tools() -> list[dict[str, str]]:
    """Catalog for context usage — same assembly path as the agent loop."""
    return [
        {
            "name": getattr(t, "name", "?"),
            "description": getattr(t, "description", "") or "",
        }
        for t in tools_for("")
    ]
