"""In-process lifecycle hooks around context compaction."""

from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from typing import Any

CompactionHook = Callable[[dict[str, Any]], Any | Awaitable[Any]]

_pre_hooks: list[CompactionHook] = []
_post_hooks: list[CompactionHook] = []


def register_pre_compact_hook(hook: CompactionHook) -> None:
    if hook not in _pre_hooks:
        _pre_hooks.append(hook)


def register_post_compact_hook(hook: CompactionHook) -> None:
    if hook not in _post_hooks:
        _post_hooks.append(hook)


def clear_compaction_hooks() -> None:
    _pre_hooks.clear()
    _post_hooks.clear()


async def _run(hooks: list[CompactionHook], event: dict[str, Any]) -> None:
    for hook in tuple(hooks):
        result = hook(dict(event))
        if inspect.isawaitable(result):
            await result


async def run_pre_compact_hooks(event: dict[str, Any]) -> None:
    await _run(_pre_hooks, event)


async def run_post_compact_hooks(event: dict[str, Any]) -> None:
    await _run(_post_hooks, event)
