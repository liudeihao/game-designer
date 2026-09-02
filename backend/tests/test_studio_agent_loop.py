"""Tests for the compiled ReAct graph and related transcript helpers."""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, ToolMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.errors import GraphInterrupt
from langgraph.types import Command

from app.conversations.runtime import is_message_visible_in_ui
from app.conversations.snapshot import messages as serialize_messages
from app.graph import build_graph
from app.agent.helpers import persist_transcript
from app.agent.loop import LAST_ROUND_NUDGE, _OBS_LIMIT, call_model, message_text, tool_messages_for
from app.agent.tools.mode import SUGGEST_MODE_TOOL, suggest_mode
from app.agent.tools.plan_panel import HOLD_TOOL_MUST_NOT_RUN


class _FakeLLM:
    """Scripted LLM: each astream call pops the next AIMessage."""

    def __init__(self, responses: list[AIMessage]) -> None:
        self._responses = list(responses)
        self.calls: list[list[Any]] = []

    def bind_tools(self, _tools: list[Any]) -> "_FakeLLM":
        return self

    async def astream(self, messages: list[Any]):
        self.calls.append(list(messages))
        if not self._responses:
            raise RuntimeError("no scripted responses left")
        yield self._responses.pop(0)

    async def ainvoke(self, messages: list[Any]):
        self.calls.append(list(messages))
        if not self._responses:
            raise RuntimeError("no scripted responses left")
        return self._responses.pop(0)


def _program(project_id: str, instruction: str, *, mode: str = "") -> dict[str, Any]:
    return {
        "project_id": project_id,
        "mode": mode,
        "instruction": instruction,
        "messages": [HumanMessage(content=instruction)],
        "trigger": "",
    }


async def _ainvoke(llm: Any, program: dict[str, Any], thread_id: str):
    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": thread_id}}
    with patch("app.agent.runtime.get_llm", return_value=llm):
        try:
            await graph.ainvoke(program, config)
        except GraphInterrupt:
            pass
    return graph, config, await graph.aget_state(config)


def _interrupts(snap) -> list[Any]:
    out: list[Any] = []
    for task in snap.tasks or []:
        out.extend(getattr(task, "interrupts", None) or [])
    return out


@pytest.mark.asyncio
async def test_graph_plain_reply_persists_assistant(data_dir) -> None:
    llm = _FakeLLM([AIMessage(content="你好，我是 Studio。")])
    _, _, snap = await _ainvoke(llm, _program("proj_plain", "你好"), "plain_reply")
    messages = list(snap.values.get("messages") or [])
    assert messages[-1].content == "你好，我是 Studio。"
    assert isinstance(messages[-1], AIMessage)


@pytest.mark.asyncio
async def test_graph_tool_then_reply_keeps_transcript(data_dir) -> None:
    llm = _FakeLLM(
        [
            AIMessage(
                content="",
                tool_calls=[
                    {"name": "workspace_list", "args": {}, "id": "call_1", "type": "tool_call"}
                ],
            ),
            AIMessage(content="项目目前还是空白的。"),
        ]
    )
    _, _, snap = await _ainvoke(llm, _program("proj_list", "看看项目"), "tool_then_reply")
    messages = list(snap.values.get("messages") or [])
    assert any(getattr(m, "tool_calls", None) for m in messages)
    assert any(isinstance(m, ToolMessage) for m in messages)
    assert messages[-1].content == "项目目前还是空白的。"
    assert any(isinstance(m, ToolMessage) for m in llm.calls[1])


def test_tool_messages_truncate_huge_observation() -> None:
    msgs = tool_messages_for(
        [
            {
                "name": "workspace_read",
                "ok": True,
                "result": "x" * (_OBS_LIMIT + 500),
                "call_id": "call_1",
            }
        ]
    )
    assert len(msgs[0].content) < _OBS_LIMIT + 80
    assert "已截断" in msgs[0].content


def test_persist_transcript_replaces_ai_message_chunk() -> None:
    chunk = AIMessageChunk(content="你好！我是 Studio。")
    assert chunk.type == "AIMessageChunk"
    out = persist_transcript(
        [chunk],
        answer="你好！我是 Studio。",
        reasoning="",
    )
    assert len(out) == 1
    assert isinstance(out[0], AIMessage)
    assert out[0].type == "ai"
    assert out[0].content == "你好！我是 Studio。"
    assert not (out[0].additional_kwargs or {}).get("parts")


@pytest.mark.asyncio
async def test_call_model_coerces_astream_chunks_to_ai_message() -> None:
    class _ChunkLLM:
        async def astream(self, messages: list[Any]):
            yield AIMessageChunk(content="欢迎")
            yield AIMessageChunk(content="回来。")

        async def ainvoke(self, messages: list[Any]):
            raise AssertionError("ainvoke should not be used")

    response, _streamed, _emitted = await call_model(
        _ChunkLLM(),
        [HumanMessage(content="hi")],
        stream_final=True,
    )
    assert message_text(response) == "欢迎回来。"
    assert isinstance(response, AIMessage)
    assert not isinstance(response, AIMessageChunk)
    assert response.type == "ai"


@pytest.mark.asyncio
async def test_graph_streams_reply_deltas_not_tool_rounds(data_dir) -> None:
    tokens: list[str] = []

    class _ChunkLLM:
        def __init__(self) -> None:
            self.round = 0

        def bind_tools(self, _tools):
            return self

        async def astream(self, messages: list[Any]):
            self.round += 1
            if self.round == 1:
                yield AIMessageChunk(
                    content="",
                    tool_call_chunks=[
                        {
                            "index": 0,
                            "id": "call_1",
                            "name": "workspace_list",
                            "args": "{}",
                        }
                    ],
                )
            else:
                yield AIMessageChunk(content="项")
                yield AIMessageChunk(content="目空白。")

        async def ainvoke(self, messages: list[Any]):
            raise AssertionError("ainvoke should not be used")

    with patch("app.agent.helpers.stream_token", side_effect=lambda t, node="": tokens.append(t)):
        with patch("app.agent.loop.stream_token", side_effect=lambda t, node="": tokens.append(t)):
            await _ainvoke(_ChunkLLM(), _program("proj_stream", "看看"), "stream_deltas")

    assert tokens == ["项", "目空白。"]


@pytest.mark.asyncio
async def test_graph_streams_tool_round_preamble_before_tools(data_dir) -> None:
    tokens: list[str] = []

    class _ChunkLLM:
        def __init__(self) -> None:
            self.round = 0

        def bind_tools(self, _tools):
            return self

        async def astream(self, messages: list[Any]):
            self.round += 1
            if self.round == 1:
                yield AIMessageChunk(
                    content="方向已确认，开始查阅：",
                    tool_call_chunks=[
                        {
                            "index": 0,
                            "id": "call_1",
                            "name": "workspace_list",
                            "args": "{}",
                        }
                    ],
                )
            else:
                yield AIMessageChunk(content="核心文档已就绪。")

        async def ainvoke(self, messages: list[Any]):
            raise AssertionError("ainvoke should not be used")

    with patch("app.agent.helpers.stream_token", side_effect=lambda t, node="": tokens.append(t)):
        with patch("app.agent.loop.stream_token", side_effect=lambda t, node="": tokens.append(t)):
            with patch(
                "app.agent.nodes.llm.stream_token", side_effect=lambda t, node="": tokens.append(t)
            ):
                _, _, snap = await _ainvoke(
                    _ChunkLLM(), _program("proj_preamble", "开始吧"), "stream_preamble"
                )

    assert "方向已确认，开始查阅：" in tokens
    assert any("核心文档已就绪。" in t for t in tokens) or "核心文档已就绪。" in "".join(tokens)
    assert list(snap.values.get("messages") or [])[-1].content == "核心文档已就绪。"


def test_ui_serializer_hides_tool_transcript() -> None:
    class Snap:
        values = {
            "messages": [
                HumanMessage(content="你好"),
                AIMessage(
                    content="",
                    tool_calls=[
                        {"name": "workspace_list", "args": {}, "id": "c1", "type": "tool_call"}
                    ],
                ),
                ToolMessage(content="[]", tool_call_id="c1"),
                AIMessage(
                    content="欢迎。",
                    additional_kwargs={"parts": [{"type": "text", "content": "欢迎。"}]},
                ),
            ]
        }

    assert not is_message_visible_in_ui(Snap.values["messages"][1])
    assert not is_message_visible_in_ui(Snap.values["messages"][2])
    assert is_message_visible_in_ui(Snap.values["messages"][3])

    ui = serialize_messages(Snap())
    assert [m["role"] for m in ui] == ["human", "ai"]
    assert ui[1]["content"] == "欢迎。"


def test_graph_has_shared_react_nodes() -> None:
    names = set(build_graph().nodes)
    assert names >= {
        "turn_setup",
        "agent_llm",
        "permission_gate",
        "agent_tools",
        "turn_finalize",
        "user_choice",
    }


def test_user_choice_tools_must_not_execute() -> None:
    with pytest.raises(RuntimeError, match="冻结"):
        suggest_mode.invoke({"mode": "plan", "message": "建议规划", "reason": "范围大"})
    assert HOLD_TOOL_MUST_NOT_RUN


@pytest.mark.asyncio
async def test_graph_continues_after_suggest_mode_switch(data_dir) -> None:
    llm = _FakeLLM(
        [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": SUGGEST_MODE_TOOL,
                        "args": {"mode": "plan", "message": "建议进入 Plan"},
                        "id": "call_p",
                        "type": "tool_call",
                    }
                ],
            ),
            AIMessage(content="好，我们先做规划。"),
        ]
    )
    graph, config, snap = await _ainvoke(
        llm, _program("proj_enter", "做个大游戏"), "enter_plan"
    )
    interrupts = _interrupts(snap)
    assert interrupts
    assert interrupts[0].value.get("variant") == "suggest_mode"
    assert interrupts[0].value.get("mode") == "plan"

    with patch("app.agent.runtime.get_llm", return_value=llm):
        try:
            await graph.ainvoke(Command(resume={"action": "switch"}), config)
        except GraphInterrupt:
            pass
    snap = await graph.aget_state(config)
    assert snap.values.get("mode") == "plan"
    texts = [str(getattr(m, "content", "") or "") for m in (snap.values.get("messages") or [])]
    assert any("好，我们先做规划。" in t for t in texts)
    assert len(llm.calls) >= 2


@pytest.mark.asyncio
async def test_graph_suggest_mode_dismiss_stays_in_agent(data_dir) -> None:
    llm = _FakeLLM(
        [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": SUGGEST_MODE_TOOL,
                        "args": {"mode": "plan", "message": "建议进入 Plan"},
                        "id": "call_d",
                        "type": "tool_call",
                    }
                ],
            ),
            AIMessage(content="好，我们先从小处改。"),
        ]
    )
    graph, config, snap = await _ainvoke(
        llm, _program("proj_choice", "定方向"), "suggest_mode"
    )
    assert _interrupts(snap)

    with patch("app.agent.runtime.get_llm", return_value=llm):
        try:
            await graph.ainvoke(Command(resume={"action": "dismiss"}), config)
        except GraphInterrupt:
            pass
    snap = await graph.aget_state(config)
    assert snap.values.get("mode") in ("", None)
    texts = [str(getattr(m, "content", "") or "") for m in (snap.values.get("messages") or [])]
    assert any("好，我们先从小处改。" in t for t in texts)


@pytest.mark.asyncio
async def test_graph_nudges_before_last_round(data_dir, monkeypatch) -> None:
    monkeypatch.setattr("app.agent.runtime.AGENT_MAX_ROUNDS", 2)
    llm = _FakeLLM(
        [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "workspace_list",
                        "args": {},
                        "id": "call_1",
                        "type": "tool_call",
                    }
                ],
            ),
            AIMessage(content="项目是空的。"),
        ]
    )
    _, _, snap = await _ainvoke(llm, _program("proj_nudge", "看看"), "last_round_nudge")
    tool_msgs = [
        m for m in (snap.values.get("messages") or []) if isinstance(m, ToolMessage)
    ]
    assert tool_msgs
    assert LAST_ROUND_NUDGE.strip() in str(tool_msgs[0].content)
