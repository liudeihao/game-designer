"""Checkpoint size of the in-flight turn_request channel."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver

from app.graph import build_graph


@pytest.mark.asyncio
async def test_turn_request_cleared_after_finalize(data_dir) -> None:
    class _LLM:
        def bind_tools(self, _tools):
            return self

        async def astream(self, _messages):
            yield AIMessage(content="你好。")

        async def ainvoke(self, messages):
            async for chunk in self.astream(messages):
                return chunk
            raise RuntimeError("empty")

    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "ckpt_clear"}}
    program = {
        "project_id": "proj_ckpt",
        "mode": "ask",
        "instruction": "你好",
        "messages": [HumanMessage(content="你好")],
        "trigger": "",
    }
    with patch("app.agent.runtime.get_llm", return_value=_LLM()):
        await graph.ainvoke(program, config)
    snap = await graph.aget_state(config)
    assert list(snap.values.get("turn_request") or []) == []


@pytest.mark.asyncio
async def test_multi_step_turn_request_stays_bounded(data_dir) -> None:
    class _LLM:
        def __init__(self) -> None:
            self.n = 0

        def bind_tools(self, _tools):
            return self

        async def astream(self, _messages):
            self.n += 1
            if self.n < 8:
                yield AIMessage(
                    content=f"读一下 {self.n}",
                    tool_calls=[
                        {
                            "name": "workspace_list",
                            "args": {},
                            "id": f"c{self.n}",
                            "type": "tool_call",
                        }
                    ],
                )
            else:
                yield AIMessage(content="看完了。")

        async def ainvoke(self, messages):
            async for chunk in self.astream(messages):
                return chunk
            raise RuntimeError("empty")

    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "ckpt_size"}}
    program = {
        "project_id": "proj_ckpt",
        "mode": "ask",
        "instruction": "看看工作区",
        "messages": [HumanMessage(content="看看工作区")],
        "trigger": "",
    }
    with patch("app.agent.runtime.get_llm", return_value=_LLM()):
        await graph.ainvoke(program, config)
    snap = await graph.aget_state(config)
    req = list(snap.values.get("turn_request") or [])
    assert req == []
    messages = list(snap.values.get("messages") or [])
    blob = json.dumps(
        [getattr(m, "content", "") for m in messages],
        ensure_ascii=False,
    )
    assert len(blob.encode("utf-8")) < 200_000
