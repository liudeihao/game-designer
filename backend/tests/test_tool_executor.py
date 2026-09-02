from dataclasses import dataclass
from typing import Any

import asyncio
import pytest
from langgraph.errors import GraphInterrupt
from langgraph.types import Interrupt

from app.agent.tools.executor import execute_tool_calls


@dataclass
class FakeTool:
    name: str

    async def ainvoke(self, arguments: dict[str, Any]) -> Any:
        return {"received": arguments}


@dataclass
class InterruptTool:
    name: str

    async def ainvoke(self, arguments: dict[str, Any]) -> Any:
        raise GraphInterrupt(
            (
                Interrupt(
                    value={
                        "type": "user_choice",
                        "message": "确认一下",
                        "questions": [{"id": "q1", "prompt": "选 A 还是 B？"}],
                    }
                ),
            )
        )


@dataclass
class BoomTool:
    name: str

    async def ainvoke(self, arguments: dict[str, Any]) -> Any:
        raise RuntimeError("tool exploded")


async def test_execute_tool_calls_correlates_success_and_missing_tools() -> None:
    calls = [
        {"id": "one", "name": "known", "args": {"x": 1}},
        {"id": "two", "name": "missing", "args": {"y": 2}},
    ]

    results = await execute_tool_calls(calls, [FakeTool("known")])

    assert results[0] == {
        "name": "known",
        "args": {"x": 1},
        "result": {"received": {"x": 1}},
        "ok": True,
        "call_id": "one",
    }
    assert results[1] == {
        "name": "missing",
        "args": {"y": 2},
        "error": "Unknown tool: missing",
        "ok": False,
        "call_id": "two",
    }


async def test_execute_tool_calls_reraises_graph_interrupt() -> None:
    with pytest.raises(GraphInterrupt):
        await execute_tool_calls(
            [{"id": "ask", "name": "clarify", "args": {}}],
            [InterruptTool("clarify")],
        )


async def test_execute_tool_calls_still_captures_ordinary_errors() -> None:
    results = await execute_tool_calls(
        [{"id": "boom", "name": "broken", "args": {"z": 3}}],
        [BoomTool("broken")],
    )
    assert results == [
        {
            "name": "broken",
            "args": {"z": 3},
            "error": "tool exploded",
            "ok": False,
            "call_id": "boom",
        }
    ]


async def test_execute_tool_calls_runs_in_parallel() -> None:
    started = asyncio.Event()
    release = asyncio.Event()

    class SlowTool:
        name = "slow"

        async def ainvoke(self, arguments: dict[str, Any]) -> Any:
            started.set()
            await release.wait()
            return "slow-done"

    class FastTool:
        name = "fast"

        async def ainvoke(self, arguments: dict[str, Any]) -> Any:
            await started.wait()
            release.set()
            return "fast-done"

    results = await asyncio.wait_for(
        execute_tool_calls(
            [
                {"id": "a", "name": "slow", "args": {}},
                {"id": "b", "name": "fast", "args": {}},
            ],
            [SlowTool(), FastTool()],
        ),
        timeout=2,
    )
    assert [item["name"] for item in results] == ["slow", "fast"]
    assert results[0]["result"] == "slow-done"
    assert results[1]["result"] == "fast-done"


async def test_execute_tool_calls_interrupt_cancels_siblings() -> None:
    started = asyncio.Event()
    cancelled = asyncio.Event()

    class SlowTool:
        name = "slow"

        async def ainvoke(self, arguments: dict[str, Any]) -> Any:
            started.set()
            try:
                await asyncio.sleep(30)
            except asyncio.CancelledError:
                cancelled.set()
                raise
            return "slow"

    class WaitThenInterrupt:
        name = "clarify"

        async def ainvoke(self, arguments: dict[str, Any]) -> Any:
            await started.wait()
            raise GraphInterrupt(
                (
                    Interrupt(
                        value={
                            "type": "user_choice",
                            "message": "确认一下",
                            "questions": [{"id": "q1", "prompt": "选 A 还是 B？"}],
                        }
                    ),
                )
            )

    with pytest.raises(GraphInterrupt):
        await execute_tool_calls(
            [
                {"id": "ask", "name": "clarify", "args": {}},
                {"id": "slow", "name": "slow", "args": {}},
            ],
            [WaitThenInterrupt(), SlowTool()],
        )
    assert cancelled.is_set()
