"""Workspace tools: model sees relative paths; runtime supplies workspace_id."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langchain_core.tools import tool
from langgraph.prebuilt import ToolRuntime
from langgraph.types import Command

from app.agent.tools.deps import ASK, NORMAL, PLAN
from app.agent.tools.inject import (
    mode_denied,
    session_from_runtime,
    tool_command,
)
from app.agent.tools.schemas import (
    ConversationSummaryArgs,
    WorkspaceDeleteArgs,
    WorkspaceGrepArgs,
    WorkspaceListArgs,
    WorkspaceReadArgs,
    WorkspaceSearchReplaceArgs,
    WorkspaceWriteArgs,
    _observe,
    _write_payload,
)
from app.docs._ops import conversation_get_summary

if TYPE_CHECKING:
    from app.agent.tools.registry import ToolRegistry

_WRITE_NAMES = frozenset(
    {"workspace_write", "workspace_search_replace", "workspace_delete"}
)
_READ_MODES = (ASK, PLAN, NORMAL)
_WRITE_MODES = (NORMAL,)


def _run_workspace(
    runtime: ToolRuntime,
    name: str,
    allowed: tuple[str, ...],
    op,
) -> Command:
    denied = mode_denied(runtime, name, set(allowed))
    if denied:
        return tool_command(runtime, denied)
    session = session_from_runtime(runtime)
    before = len(session.writes)
    return tool_command(runtime, _observe(op(session)), session=session, before_writes=before)


@tool("workspace_list", args_schema=WorkspaceListArgs)
def workspace_list(path: str = "", runtime: ToolRuntime = None) -> Command:  # type: ignore[assignment]
    """列出 docs/ 工作区文件与目录。路径相对 docs/，例如空字符串或 系统。"""

    return _run_workspace(
        runtime,
        "workspace_list",
        _READ_MODES,
        lambda session: session.list(path=path),
    )


@tool("workspace_read", args_schema=WorkspaceReadArgs)
def workspace_read(path: str, runtime: ToolRuntime = None) -> Command:  # type: ignore[assignment]
    """读取 docs/ 下单个 Markdown 文件。例：战斗.md、系统/经济.md。"""

    return _run_workspace(
        runtime,
        "workspace_read",
        _READ_MODES,
        lambda session: session.read(path),
    )


@tool("workspace_grep", args_schema=WorkspaceGrepArgs)
def workspace_grep(
    pattern: str,
    path: str = "",
    max_matches: int = 40,
    runtime: ToolRuntime = None,  # type: ignore[assignment]
) -> Command:
    """在 docs/ 文件树中搜索文本。"""

    return _run_workspace(
        runtime,
        "workspace_grep",
        _READ_MODES,
        lambda session: session.grep(pattern, path=path, max_matches=max_matches),
    )


@tool("conversation_get_summary", args_schema=ConversationSummaryArgs)
def conversation_summary_tool(
    reason: str = "",
    runtime: ToolRuntime = None,  # type: ignore[assignment]
) -> Command:
    """读取共享对话记忆摘要。默认上下文隔离，需要时再取。"""

    _ = reason
    denied = mode_denied(runtime, "conversation_get_summary", set(_READ_MODES))
    if denied:
        return tool_command(runtime, denied)
    state = runtime.state if isinstance(runtime.state, dict) else {}
    import json

    payload = conversation_get_summary(str(state.get("conversation_summary") or ""))
    try:
        text = json.dumps(payload, ensure_ascii=False, default=str)
    except Exception:
        text = str(payload)
    return tool_command(runtime, text)


@tool("workspace_write", args_schema=WorkspaceWriteArgs)
def workspace_write(files: list[Any], runtime: ToolRuntime = None) -> Command:  # type: ignore[assignment]
    """新建或整份覆写 docs/ 下的 Markdown 文件。传入 files: [{path, content}, ...]。路径可含子目录（如 系统/经济.md），目录随文件创建。"""

    return _run_workspace(
        runtime,
        "workspace_write",
        _WRITE_MODES,
        lambda session: session.write(_write_payload(files)),
    )


@tool("workspace_search_replace", args_schema=WorkspaceSearchReplaceArgs)
def workspace_search_replace(
    path: str,
    old: str,
    new: str,
    runtime: ToolRuntime = None,  # type: ignore[assignment]
) -> Command:
    """在已有 Markdown 文件中替换一段原文（首次出现）。"""

    return _run_workspace(
        runtime,
        "workspace_search_replace",
        _WRITE_MODES,
        lambda session: session.search_replace(path, old, new),
    )


@tool("workspace_delete", args_schema=WorkspaceDeleteArgs)
def workspace_delete(paths: list[str], runtime: ToolRuntime = None) -> Command:  # type: ignore[assignment]
    """删除 docs/ 下的一个或多个 Markdown 文件。"""

    return _run_workspace(
        runtime,
        "workspace_delete",
        _WRITE_MODES,
        lambda session: session.delete(paths),
    )


WORKSPACE_READ_TOOLS = [
    workspace_list,
    workspace_read,
    workspace_grep,
    conversation_summary_tool,
]
WORKSPACE_WRITE_TOOLS = [
    workspace_write,
    workspace_search_replace,
    workspace_delete,
]


def register(registry: ToolRegistry) -> None:
    registry.add(modes=_READ_MODES, tools=WORKSPACE_READ_TOOLS)
    registry.add(modes=_WRITE_MODES, tools=WORKSPACE_WRITE_TOOLS)
