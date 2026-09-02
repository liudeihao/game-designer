"""Execute model-requested tool calls with correlated results."""

from __future__ import annotations

import asyncio
from typing import Any

from langgraph.errors import GraphBubbleUp

from app.agent.tools.models import ToolExecution


def _field(call: Any, key: str, default: Any) -> Any:
    return call.get(key, default) if isinstance(call, dict) else getattr(call, key, default)


async def _run_one(
    call: Any,
    tool_map: dict[str, Any],
) -> ToolExecution:
    name = str(_field(call, "name", "") or "")
    args = _field(call, "args", {}) or {}
    call_id = str(_field(call, "id", "") or "")
    tool = tool_map.get(name)
    if tool is None:
        return {
            "name": name,
            "args": args,
            "error": f"Unknown tool: {name}",
            "ok": False,
            "call_id": call_id,
        }
    try:
        result = await tool.ainvoke(args)
        return {"name": name, "args": args, "result": result, "ok": True, "call_id": call_id}
    except GraphBubbleUp:
        raise
    except Exception as exc:
        return {
            "name": name,
            "args": args,
            "error": str(exc),
            "ok": False,
            "call_id": call_id,
        }


async def execute_tool_calls(
    tool_calls: list[Any], tools: list[Any]
) -> list[ToolExecution]:
    """Run independent tool calls in parallel. HITL interrupt cancels siblings."""
    tool_map = {getattr(tool, "name", ""): tool for tool in tools}
    if not tool_calls:
        return []

    async def indexed(index: int, call: Any) -> tuple[int, ToolExecution]:
        return index, await _run_one(call, tool_map)

    tasks = [
        asyncio.create_task(indexed(i, call)) for i, call in enumerate(tool_calls)
    ]
    results: list[ToolExecution | None] = [None] * len(tasks)
    pending: set[asyncio.Task] = set(tasks)
    try:
        while pending:
            done, pending = await asyncio.wait(
                pending, return_when=asyncio.FIRST_COMPLETED
            )
            for task in done:
                try:
                    index, result = task.result()
                    results[index] = result
                except GraphBubbleUp:
                    for leftover in pending:
                        leftover.cancel()
                    if pending:
                        await asyncio.gather(*pending, return_exceptions=True)
                    raise
    except GraphBubbleUp:
        raise

    return [item for item in results if item is not None]
