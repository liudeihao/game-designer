"""Run bound tool calls through prebuilt ToolNode (injects ToolRuntime)."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage, ToolMessage
from langgraph.prebuilt import ToolNode
from langgraph.runtime import Runtime, get_runtime
from langgraph.types import Command

from app.agent.context import context_from_state
from app.agent.loop import call_args, call_id, call_name


def _union_strs(*groups: list[str] | None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for group in groups:
        for item in group or []:
            key = str(item)
            if key in seen:
                continue
            seen.add(key)
            out.append(key)
    return out


def _merge_revs(*groups: dict | None) -> dict[str, int]:
    out: dict[str, int] = {}
    for group in groups:
        if not isinstance(group, dict):
            continue
        for path, rev in group.items():
            try:
                out[str(path)] = int(rev)
            except (TypeError, ValueError):
                continue
    return out


def _runtime_for_tools(state: dict[str, Any]) -> Runtime:
    """Prefer the graph Runtime; fill AgentContext from state when invoke omitted it."""
    ctx = context_from_state(state)
    try:
        parent = get_runtime()
    except Exception:
        parent = None
    if parent is None:
        return Runtime(context=ctx)
    if getattr(parent, "context", None) is None:
        return parent.override(context=ctx)
    return parent


def merge_tool_node_output(
    raw: Any,
    *,
    base_read_paths: list[str] | None = None,
    base_listed_dirs: list[str] | None = None,
    base_writes: list | None = None,
    base_revs: dict | None = None,
) -> tuple[list[ToolMessage], dict[str, Any]]:
    """Flatten ToolNode Command / message output into messages + state patches."""
    items = raw if isinstance(raw, list) else [raw]
    messages: list[ToolMessage] = []
    extra: dict[str, Any] = {}
    read_paths = list(base_read_paths or [])
    listed_dirs = list(base_listed_dirs or [])
    writes = list(base_writes or [])
    revs = _merge_revs(base_revs)
    for item in items:
        if isinstance(item, Command):
            upd = dict(item.update or {})
            for msg in upd.pop("messages", None) or []:
                if isinstance(msg, ToolMessage):
                    messages.append(msg)
            if "read_paths" in upd:
                read_paths = _union_strs(read_paths, list(upd.pop("read_paths") or []))
            if "listed_dirs" in upd:
                listed_dirs = _union_strs(listed_dirs, list(upd.pop("listed_dirs") or []))
            if "workspace_writes" in upd:
                writes = writes + list(upd.pop("workspace_writes") or [])
            if "workspace_revs" in upd:
                revs = _merge_revs(revs, upd.pop("workspace_revs"))
            extra.update(upd)
        elif isinstance(item, dict):
            for msg in item.get("messages") or []:
                if isinstance(msg, ToolMessage):
                    messages.append(msg)
            extra.update({k: v for k, v in item.items() if k != "messages"})
        elif isinstance(item, ToolMessage):
            messages.append(item)
        elif isinstance(item, list):
            for msg in item:
                if isinstance(msg, ToolMessage):
                    messages.append(msg)
    extra["read_paths"] = read_paths
    extra["listed_dirs"] = listed_dirs
    extra["workspace_writes"] = writes
    extra["workspace_revs"] = revs
    return messages, extra


def results_from_messages(calls: list[Any], messages: list[ToolMessage]) -> list[dict[str, Any]]:
    by_id = {str(getattr(msg, "tool_call_id", "") or ""): msg for msg in messages}
    results: list[dict[str, Any]] = []
    for call in calls:
        cid = call_id(call)
        msg = by_id.get(cid)
        content = str(getattr(msg, "content", "") or "") if msg is not None else ""
        status = str(getattr(msg, "status", "") or "success")
        ok = status != "error"
        results.append(
            {
                "name": call_name(call),
                "args": call_args(call),
                "result": content,
                "ok": ok,
                "error": None if ok else content,
                "call_id": cid,
            }
        )
    return results


async def run_tool_node(
    state: dict[str, Any],
    tools: list[Any],
    calls: list[Any],
    *,
    config: dict[str, Any] | None = None,
) -> tuple[list[ToolMessage], dict[str, Any], list[dict[str, Any]]]:
    """Execute ``calls`` via ToolNode. ``state`` is the full AgentState snapshot."""
    if not calls or not tools:
        return [], {}, []
    invoke_state = dict(state)
    invoke_state["messages"] = [
        AIMessage(content="", tool_calls=list(calls)),
    ]
    raw = await ToolNode(tools, handle_tool_errors=True).ainvoke(
        invoke_state,
        config or {},
        runtime=_runtime_for_tools(state),
    )
    messages, extra = merge_tool_node_output(
        raw,
        base_read_paths=list(state.get("read_paths") or []),
        base_listed_dirs=list(state.get("listed_dirs") or []),
        base_writes=list(state.get("workspace_writes") or []),
        base_revs=dict(state.get("workspace_revs") or {}),
    )
    return messages, extra, results_from_messages(calls, messages)
