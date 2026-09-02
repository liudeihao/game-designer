"""Plan mode writes the plan through a tool, so its confirmation must stream."""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.errors import GraphInterrupt

from app.agent.nodes import WRITE_CONFIRM
from app.graph import build_graph

PLAN_MD = "# 计划\n\n## 确定核心玩法\n"


@pytest.fixture
def streamed(monkeypatch) -> list[dict[str, Any]]:
    """Capture the custom-stream payloads a node writes during the turn."""
    written: list[dict[str, Any]] = []
    monkeypatch.setattr("app.agent.helpers.get_stream_writer", lambda: written.append)
    return written


def _tokens(streamed: list[dict[str, Any]]) -> str:
    return "".join(c.get("text", "") for c in streamed if c.get("type") == "token")


def _program() -> dict[str, Any]:
    return {
        "project_id": "p1",
        "mode": "plan",
        "instruction": "做个塔防",
        "messages": [HumanMessage(content="做个塔防")],
        "plan_markdown": "",
        "trigger": "",
    }


class _WriteThenReply:
    def __init__(self, reply: str) -> None:
        self.n = 0
        self.reply = reply

    def bind_tools(self, _tools):
        return self

    async def astream(self, _messages):
        self.n += 1
        if self.n == 1:
            yield AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "write_plan",
                        "args": {"title": "计划", "plan_markdown": PLAN_MD},
                        "id": "c1",
                        "type": "tool_call",
                    }
                ],
            )
            return
        yield AIMessage(content=self.reply)

    async def ainvoke(self, messages):
        async for chunk in self.astream(messages):
            return chunk
        raise RuntimeError("empty")


@pytest.mark.asyncio
async def test_write_plan_confirmation_is_streamed_and_persisted(
    streamed, data_dir
) -> None:
    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "write_confirm"}}
    with patch("app.agent.runtime.get_llm", return_value=_WriteThenReply("")):
        with patch("app.agent.tools.plan_panel.emit_plan"):
            try:
                await graph.ainvoke(_program(), config)
            except GraphInterrupt:
                pass
    snap = await graph.aget_state(config)
    assert _tokens(streamed) == WRITE_CONFIRM
    assert (snap.values.get("messages") or [])[-1].content == WRITE_CONFIRM
    assert (snap.values.get("plan_markdown") or "").strip() == PLAN_MD.strip()
    assert snap.values.get("plan_status") == "ready"


@pytest.mark.asyncio
async def test_model_reply_is_not_overwritten_by_the_confirmation(
    streamed, data_dir
) -> None:
    reply = "计划已写好，你看看第三节。"
    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "write_keep_reply"}}
    with patch("app.agent.runtime.get_llm", return_value=_WriteThenReply(reply)):
        with patch("app.agent.tools.plan_panel.emit_plan"):
            try:
                await graph.ainvoke(_program(), config)
            except GraphInterrupt:
                pass
    snap = await graph.aget_state(config)
    assert WRITE_CONFIRM not in _tokens(streamed)
    assert (snap.values.get("messages") or [])[-1].content == reply
