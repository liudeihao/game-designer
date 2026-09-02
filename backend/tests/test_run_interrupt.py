"""Graceful interrupt: cooperative cancel, checkpointed history, continue-after-stop."""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.checkpoint.memory import MemorySaver

from app.agent.cancel import RunCancel
from app.agent.nodes import INTERRUPT_NOTE
from app.conversations.runtime import serialize_messages
from app.conversations.runs import RunRegistry
from app.graph import build_graph


def _program(instruction: str, *, project_id: str = "proj_intr", mode: str = "ask") -> dict[str, Any]:
    return {
        "project_id": project_id,
        "mode": mode,
        "instruction": instruction,
        "messages": [HumanMessage(content=instruction)],
        "trigger": "",
    }


def _ais(snap) -> list[Any]:
    return [m for m in (snap.values.get("messages") or []) if getattr(m, "type", "") == "ai"]


def _tools(snap) -> list[Any]:
    return [m for m in (snap.values.get("messages") or []) if isinstance(m, ToolMessage)]


class _StreamingLLM:
    """Yields two chunks; tests request cancel after the first."""

    def __init__(self, token: RunCancel, first: AIMessage, second: AIMessage | None = None) -> None:
        self.token = token
        self.first = first
        self.second = second or AIMessage(content="不该出现")
        self.calls = 0

    def bind_tools(self, _tools: list[Any]) -> "_StreamingLLM":
        return self

    async def astream(self, _messages: list[Any]):
        self.calls += 1
        yield self.first
        self.token.request()
        yield self.second

    async def ainvoke(self, messages: list[Any]):
        async for chunk in self.astream(messages):
            return chunk
        raise RuntimeError("empty")


class _ScriptedLLM:
    def __init__(self, responses: list[AIMessage]) -> None:
        self._responses = list(responses)
        self.calls = 0

    def bind_tools(self, _tools: list[Any]) -> "_ScriptedLLM":
        return self

    async def astream(self, _messages: list[Any]):
        self.calls += 1
        if not self._responses:
            raise AssertionError("second LLM call should not happen")
        yield self._responses.pop(0)

    async def ainvoke(self, messages: list[Any]):
        async for chunk in self.astream(messages):
            return chunk
        raise RuntimeError("empty")


@pytest.mark.asyncio
async def test_stream_interrupt_keeps_partial_text_and_note(data_dir) -> None:
    token = RunCancel()
    llm = _StreamingLLM(token, AIMessage(content="部分内容"))
    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "intr_stream", "run_cancel": token}}
    with patch("app.agent.runtime.get_llm", return_value=llm):
        await graph.ainvoke(_program("写一段"), config)
    snap = await graph.aget_state(config)
    last = _ais(snap)[-1]
    text = last.content or ""
    assert "部分内容" in text
    assert "不该出现" not in text
    assert INTERRUPT_NOTE in text
    assert (last.additional_kwargs or {}).get("interrupted") is True
    serialized = serialize_messages([last])
    assert serialized and serialized[0].get("interrupted") is True


@pytest.mark.asyncio
async def test_interrupt_drops_partial_tool_calls(data_dir) -> None:
    token = RunCancel()
    llm = _StreamingLLM(
        token,
        AIMessage(
            content="先看一眼",
            tool_calls=[
                {
                    "name": "workspace_write",
                    "args": {"path": "broken.md", "content": "{"},
                    "id": "c_partial",
                    "type": "tool_call",
                }
            ],
        ),
    )
    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "intr_drop_tc", "run_cancel": token}}
    with patch("app.agent.runtime.get_llm", return_value=llm):
        await graph.ainvoke(_program("改文档", mode=""), config)
    snap = await graph.aget_state(config)
    last = _ais(snap)[-1]
    assert not (getattr(last, "tool_calls", None) or [])
    assert INTERRUPT_NOTE in (last.content or "")
    assert not _tools(snap)


@pytest.mark.asyncio
async def test_interrupt_after_tools_skips_next_llm(data_dir) -> None:
    token = RunCancel()
    llm = _ScriptedLLM(
        [
            AIMessage(
                content="列一下",
                tool_calls=[
                    {
                        "name": "workspace_list",
                        "args": {},
                        "id": "c_list",
                        "type": "tool_call",
                    }
                ],
            )
        ]
    )

    async def run_then_stop(state, tools, calls, *, config=None):
        del state, tools, config
        msgs = [
            ToolMessage(content="[]", tool_call_id="c_list"),
        ]
        extra = {"read_paths": [], "listed_dirs": [], "workspace_writes": []}
        results = [
            {
                "name": "workspace_list",
                "args": {},
                "result": "[]",
                "ok": True,
                "error": None,
                "call_id": "c_list",
            }
        ]
        token.request()
        return msgs, extra, results

    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "intr_tools", "run_cancel": token}}
    with (
        patch("app.agent.runtime.get_llm", return_value=llm),
        patch("app.agent.nodes.tools.run_tool_node", run_then_stop),
    ):
        await graph.ainvoke(_program("看看工作区"), config)
    snap = await graph.aget_state(config)
    assert llm.calls == 1
    assert _tools(snap)
    last = _ais(snap)[-1]
    assert INTERRUPT_NOTE in (last.content or "")
    assert (last.additional_kwargs or {}).get("interrupted") is True


@pytest.mark.asyncio
async def test_continue_after_interrupt(data_dir) -> None:
    token = RunCancel()
    first = _StreamingLLM(token, AIMessage(content="刚开头"))
    graph = build_graph(MemorySaver())
    thread = "intr_continue"
    config = {"configurable": {"thread_id": thread, "run_cancel": token}}
    with patch("app.agent.runtime.get_llm", return_value=first):
        await graph.ainvoke(_program("开始"), config)

    second = _ScriptedLLM([AIMessage(content="接着做完。")])
    resume = {"configurable": {"thread_id": thread}}
    with patch("app.agent.runtime.get_llm", return_value=second):
        await graph.ainvoke(_program("继续"), resume)
    snap = await graph.aget_state(resume)
    messages = list(snap.values.get("messages") or [])
    humans = [m.content for m in messages if getattr(m, "type", "") == "human"]
    ais = [m.content for m in messages if getattr(m, "type", "") == "ai"]
    assert "开始" in humans
    assert "继续" in humans
    assert any(INTERRUPT_NOTE in (c or "") for c in ais)
    assert any("接着做完" in (c or "") for c in ais)


def test_request_stop_without_run_returns_false() -> None:
    registry = RunRegistry()
    assert registry.request_stop("conv_missing") is False
    token = registry.begin("conv_live")
    assert registry.request_stop("conv_live") is True
    assert token.requested is True
    registry.end("conv_live", token)
    assert registry.request_stop("conv_live") is False


@pytest.mark.asyncio
async def test_stream_run_done_payload_flags_interrupted(data_dir) -> None:
    from app.api.stream import stream_run
    from app.agent.cancel import RunCancel as Token

    class _Snapshot:
        values: dict = {}
        tasks: list = []

    class _Runtime:
        def thread_config(self, conversation_id: str) -> dict:
            return {"configurable": {"thread_id": conversation_id}}

        async def astream(self, program, config, stream_mode):
            del program, stream_mode
            assert config["configurable"]["run_cancel"] is cancel
            return
            yield  # pragma: no cover

        async def load(self, conversation_id: str) -> _Snapshot:
            del conversation_id
            return _Snapshot()

    cancel = Token()
    cancel.request()
    with (
        patch("app.conversations._runs.load_project_workspace", return_value={"files": {}, "revs": {}}),
        patch("app.conversations._runs.db.usage_scopes", return_value={}),
        patch("app.conversations._runs.db.get_conversation", return_value=None),
        patch("app.conversations._runs.db.touch_project"),
        patch("app.conversations._runs.db.touch_conversation"),
    ):
        chunks = [
            chunk
            async for chunk in stream_run(
                _Runtime(),
                program={},
                project_id="proj_t",
                conversation_id="conv_t",
                cancel=cancel,
            )
        ]
    joined = "".join(chunks)
    assert "已按用户请求中断本轮" in joined
    assert '"interrupted": true' in joined
