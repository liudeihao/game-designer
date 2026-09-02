"""Read ToolRuntime without exposing those fields to the model."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import ToolMessage
from langgraph.prebuilt import ToolRuntime
from langgraph.types import Command

from app.agent.tools.deps import ASK, PLAN, normalize_mode
from app.agent.tools.guard import denied_message
from app.docs import DocsSession


def _context_value(ctx: Any, key: str) -> Any:
    if ctx is None:
        return None
    if isinstance(ctx, dict):
        return ctx.get(key)
    return getattr(ctx, key, None)


def _context_workspace_id(ctx: Any) -> str:
    return str(_context_value(ctx, "workspace_id") or "")


def runtime_mode(runtime: ToolRuntime) -> str:
    ctx = getattr(runtime, "context", None)
    mode = _context_value(ctx, "mode")
    if mode is not None and str(mode) != "":
        return normalize_mode(str(mode))
    return normalize_mode(_state(runtime).get("mode"))


def runtime_writable(runtime: ToolRuntime) -> bool:
    ctx = getattr(runtime, "context", None)
    # Default AgentContext() is empty; only trust writable when a workspace was set.
    if _context_workspace_id(ctx):
        if isinstance(ctx, dict) and "writable" in ctx:
            return bool(ctx["writable"])
        if hasattr(ctx, "writable"):
            return bool(ctx.writable)
    return runtime_mode(runtime) not in (PLAN, ASK)


def runtime_workspace_id(runtime: ToolRuntime) -> str:
    return _context_workspace_id(getattr(runtime, "context", None)) or str(
        _state(runtime).get("project_id") or ""
    )


def _state(runtime: ToolRuntime) -> dict[str, Any]:
    state = getattr(runtime, "state", None)
    return state if isinstance(state, dict) else {}


def runtime_require_read(runtime: ToolRuntime) -> bool:
    ctx = getattr(runtime, "context", None)
    if _context_workspace_id(ctx):
        if isinstance(ctx, dict) and "require_read_before_write" in ctx:
            return bool(ctx["require_read_before_write"])
        if hasattr(ctx, "require_read_before_write"):
            return bool(ctx.require_read_before_write)
    return runtime_writable(runtime)


def session_from_runtime(runtime: ToolRuntime) -> DocsSession:
    """Open this turn's workspace from trusted runtime + checkpointed bookkeeping."""
    state = _state(runtime)
    scratch = dict(state.get("turn_scratch") or {})
    session = DocsSession(
        runtime_workspace_id(runtime),
        writable=runtime_writable(runtime),
        require_read_before_write=runtime_require_read(runtime),
    )
    session.writes = list(state.get("workspace_writes") or scratch.get("writes") or [])
    session.read_paths = set(state.get("read_paths") or scratch.get("read_paths") or [])
    session.listed_dirs = set(state.get("listed_dirs") or scratch.get("listed_dirs") or [])
    saved_revs = state.get("workspace_revs") or scratch.get("revs") or {}
    if isinstance(saved_revs, dict):
        for path, rev in saved_revs.items():
            try:
                session.revs[str(path)] = int(rev)
            except (TypeError, ValueError):
                continue
    return session


def mode_denied(runtime: ToolRuntime, name: str, allowed: set[str]) -> str | None:
    current = runtime_mode(runtime)
    if current in allowed:
        return None
    return denied_message(name, current, allowed)


def fake_tool_runtime(
    *,
    state: dict[str, Any] | None = None,
    context: Any = None,
    tool_call_id: str = "tool-call",
) -> ToolRuntime:
    """Build a ToolRuntime for unit tests (ToolNode injects this in the graph)."""
    from app.agent.context import AgentContext

    return ToolRuntime(
        state=state or {},
        context=context if context is not None else AgentContext(),
        config={},
        stream_writer=lambda _: None,
        tool_call_id=tool_call_id,
        store=None,
    )


def tool_command(
    runtime: ToolRuntime,
    content: str,
    *,
    session: DocsSession | None = None,
    extra: dict[str, Any] | None = None,
    before_writes: int = 0,
) -> Command:
    """Observation plus optional bookkeeping. Parallel writes only append the new rows."""
    update: dict[str, Any] = {
        "messages": [
            ToolMessage(content=content, tool_call_id=str(runtime.tool_call_id or ""))
        ]
    }
    if session is not None:
        update["read_paths"] = sorted(session.read_paths)
        update["listed_dirs"] = sorted(session.listed_dirs)
        update["workspace_writes"] = list(session.writes[before_writes:])
        update["workspace_revs"] = dict(session.revs)
    if extra:
        update.update(extra)
    return Command(update=update)
