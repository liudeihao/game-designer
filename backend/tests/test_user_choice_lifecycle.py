"""User Choice lifecycle: freeze the question set before interrupt, resume against it."""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.errors import GraphInterrupt
from langgraph.types import Command

from app.agent.helpers import persist_transcript
from app.agent.tools.plan_panel import (
    ASK_USER_TOOL,
    observation_from_answers,
    pending_from_ask_user_call,
)
from app.api.stream import persist_live_ui
from app.conversations.runtime import ConversationRuntime
from app.graph import build_graph


def assert_tool_calls_paired(messages: list[Any], *, allow_trailing: bool = False) -> None:
    """DeepSeek/OpenAI: each assistant tool_call must be followed by its tool messages."""
    pending: list[str] = []
    for message in messages:
        if isinstance(message, AIMessage):
            if pending:
                raise AssertionError(
                    f"tool_calls {pending} must be followed by tool messages, got another assistant"
                )
            for call in getattr(message, "tool_calls", None) or []:
                cid = call.get("id") if isinstance(call, dict) else getattr(call, "id", "")
                if cid:
                    pending.append(str(cid))
            continue
        if isinstance(message, ToolMessage):
            tid = str(getattr(message, "tool_call_id", "") or "")
            if tid in pending:
                pending.remove(tid)
            continue
        if pending:
            raise AssertionError(
                f"tool_calls {pending} must be followed by tool messages, got {type(message).__name__}"
            )
    if pending and not allow_trailing:
        raise AssertionError(f"missing tool messages for {pending}")


QUESTIONS_A = [
    {
        "id": "core_loop",
        "prompt": "核心循环？",
        "options": [{"id": "run", "label": "Roguelike 逐局探索"}],
    },
    {
        "id": "theme",
        "prompt": "题材？",
        "options": [{"id": "scifi", "label": "科幻/末世"}],
    },
]
ANSWERS_A = {"core_loop": "run", "theme": "scifi"}
QUESTIONS_B = [
    {
        "id": "tone",
        "prompt": "整体体验基调？",
        "options": [{"id": "light", "label": "轻松幽默"}],
    },
    {
        "id": "setting",
        "prompt": "世界观？",
        "options": [{"id": "fantasy", "label": "西式奇幻"}],
    },
]


class _FakeLLM:
    def __init__(self, responses: list[AIMessage]) -> None:
        self._responses = list(responses)
        self.calls: list[list[Any]] = []

    def bind_tools(self, tools: list[Any]) -> "_FakeLLM":
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


def test_observation_uses_the_question_set_it_is_given() -> None:
    text = observation_from_answers(QUESTIONS_A, {"answers": ANSWERS_A})
    assert "Roguelike 逐局探索" in text
    assert "科幻/末世" in text
    assert "整体体验基调" not in text


def test_observation_is_empty_when_ids_belong_to_another_set() -> None:
    text = observation_from_answers(QUESTIONS_B, {"answers": ANSWERS_A})
    assert "Roguelike" not in text
    assert "科幻" not in text
    assert "- 整体体验基调？:" in text
    assert "- 世界观？:" in text


def test_pending_from_ask_user_call_freezes_tool_args() -> None:
    pending = pending_from_ask_user_call(
        {
            "name": ASK_USER_TOOL,
            "id": "call_a",
            "args": {"message": "先确认方向。", "questions": QUESTIONS_A},
        }
    )
    assert pending["type"] == "user_choice"
    assert pending["variant"] == "questions"
    assert pending["message"] == "先确认方向。"
    assert pending["tool_call_id"] == "call_a"
    assert pending["questions"][0]["id"] == "core_loop"


def test_persist_held_ask_user_does_not_insert_ai_after_tool_calls() -> None:
    """Preamble must stay on the same assistant message, or resume 400s at DeepSeek."""
    held = AIMessage(
        content="先确认几件事。",
        tool_calls=[
            {
                "name": ASK_USER_TOOL,
                "args": {"message": "先确认方向。", "questions": QUESTIONS_A},
                "id": "call_a",
                "type": "tool_call",
            }
        ],
    )
    persist = persist_transcript(
        [held],
        answer="",
        reasoning="",
        preamble="先确认几件事。",
    )
    assert_tool_calls_paired(persist, allow_trailing=True)
    assert getattr(persist[-1], "tool_calls", None)
    assert persist[-1].content == "先确认几件事。"


def test_persist_keeps_plan_confirmation_on_the_held_assistant() -> None:
    """update_plan + ask_user in one step must not grow a third message.

    A separate assistant bubble after the update_plan result would sit between
    the tool_calls and the ask_user result that only arrives on resume.
    """
    held = AIMessage(
        content="",
        tool_calls=[
            {"name": "update_plan", "args": {}, "id": "call_plan", "type": "tool_call"},
            {
                "name": ASK_USER_TOOL,
                "args": {"message": "先确认方向。", "questions": QUESTIONS_A},
                "id": "call_ask",
                "type": "tool_call",
            },
        ],
    )
    persist = persist_transcript(
        [held, ToolMessage(content="已更新 plan。", tool_call_id="call_plan")],
        answer="已更新右侧 plan，可继续讨论或点击「执行计划」。",
        reasoning="",
        preamble="",
    )
    assert [type(m).__name__ for m in persist] == ["AIMessage", "ToolMessage"]
    assert "已更新右侧 plan" in persist[0].content
    assert [c["id"] for c in persist[0].tool_calls] == ["call_plan", "call_ask"]
    resumed = [*persist, ToolMessage(content="- 核心循环？: Roguelike", tool_call_id="call_ask")]
    assert_tool_calls_paired(resumed)


@pytest.mark.asyncio
async def test_plan_graph_persists_update_plan_and_ask_user_as_one_assistant(data_dir) -> None:
    llm = _FakeLLM(
        [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "update_plan",
                        "args": {"title": "第二版", "plan_markdown": "## 第二版\n- 一条"},
                        "id": "call_plan",
                        "type": "tool_call",
                    },
                    {
                        "name": ASK_USER_TOOL,
                        "args": {"message": "先确认方向。", "questions": QUESTIONS_A},
                        "id": "call_ask",
                        "type": "tool_call",
                    },
                ],
            )
        ]
    )
    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "conv_update_and_ask"}}
    program = {
        "project_id": "proj_test",
        "mode": "plan",
        "instruction": "帮我改一下计划",
        "messages": [HumanMessage(content="帮我改一下计划")],
        "plan_markdown": "## 第一版\n- 旧的",
        "plan_title": "第一版",
        "trigger": "",
    }
    with patch("app.agent.runtime.get_llm", return_value=llm):
        with patch("app.agent.tools.plan_panel.emit_plan"):
            try:
                await graph.ainvoke(program, config)
            except GraphInterrupt:
                pass
    snap = await graph.aget_state(config)
    persist = list(snap.values.get("messages") or [])
    pending = snap.values.get("pending_user_choice") or {}
    assert pending.get("tool_call_id") == "call_ask" or any(
        (getattr(task, "interrupts", None) or []) for task in (snap.tasks or [])
    )
    ais = [m for m in persist if isinstance(m, AIMessage) and getattr(m, "tool_calls", None)]
    assert len(ais) == 1
    assert [c["id"] for c in ais[0].tool_calls] == ["call_plan", "call_ask"]
    assert any(isinstance(m, ToolMessage) and m.tool_call_id == "call_plan" for m in persist)
    assert_tool_calls_paired(persist, allow_trailing=True)
    resumed = [
        *persist,
        ToolMessage(content="- 核心循环？: Roguelike", tool_call_id="call_ask"),
    ]
    assert_tool_calls_paired(resumed)


def _choice_interrupts(snap) -> list[Any]:
    out: list[Any] = []
    for task in snap.tasks or []:
        out.extend(getattr(task, "interrupts", None) or [])
    return out


@pytest.mark.asyncio
async def test_plan_graph_freezes_ask_user_instead_of_executing_it(data_dir) -> None:
    llm = _FakeLLM(
        [
            AIMessage(
                content="先确认几件事。",
                tool_calls=[
                    {
                        "name": ASK_USER_TOOL,
                        "args": {"message": "先确认方向。", "questions": QUESTIONS_A},
                        "id": "call_a",
                        "type": "tool_call",
                    }
                ],
            )
        ]
    )
    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "conv_freeze_ask"}}
    program, _ = _plan_program("conv_freeze_ask")
    with patch("app.agent.runtime.get_llm", return_value=llm):
        try:
            await graph.ainvoke(program, config)
        except GraphInterrupt:
            pass
    snap = await graph.aget_state(config)
    interrupts = _choice_interrupts(snap)
    assert interrupts
    payload = interrupts[0].value
    assert payload["questions"][0]["id"] == "core_loop"
    pending = snap.values.get("pending_user_choice") or payload
    assert (pending.get("tool_call_id") or payload.get("tool_call_id") or "call_a")
    last_ai = next(
        m
        for m in reversed(snap.values.get("messages") or [])
        if isinstance(m, AIMessage)
    )
    assert getattr(last_ai, "tool_calls", None)
    extra = getattr(last_ai, "additional_kwargs", None) or {}
    assert extra.get("plan_questions")[0]["id"] == "core_loop"
    assert [c["id"] for c in last_ai.tool_calls] == ["call_a"]
    events = list(snap.values.get("events") or [])
    assert any(e.get("type") == "user_choice" for e in events)


@pytest.mark.asyncio
async def test_hold_runs_sibling_tool_calls(data_dir) -> None:
    llm = _FakeLLM(
        [
            AIMessage(
                content="先确认。",
                tool_calls=[
                    {
                        "name": ASK_USER_TOOL,
                        "args": {"message": "先确认方向。", "questions": QUESTIONS_A},
                        "id": "call_a",
                        "type": "tool_call",
                    },
                    {
                        "name": "workspace_read",
                        "args": {"path": "README.md"},
                        "id": "call_r",
                        "type": "tool_call",
                    },
                ],
            )
        ]
    )
    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "conv_hold_sibling"}}
    program = {
        "project_id": "proj_hold_sib",
        "mode": "plan",
        "instruction": "我想做一个项目",
        "messages": [HumanMessage(content="我想做一个项目")],
        "plan_markdown": "",
        "trigger": "",
    }
    with patch("app.agent.runtime.get_llm", return_value=llm):
        try:
            await graph.ainvoke(program, config)
        except GraphInterrupt:
            pass
    snap = await graph.aget_state(config)
    persist = list(snap.values.get("messages") or [])
    ai = next(m for m in persist if isinstance(m, AIMessage) and getattr(m, "tool_calls", None))
    assert [c["id"] for c in ai.tool_calls] == ["call_a", "call_r"]
    tools = [m for m in persist if isinstance(m, ToolMessage)]
    assert [m.tool_call_id for m in tools] == ["call_r"]
    assert ASK_USER_TOOL not in [getattr(m, "name", "") for m in tools]
    assert_tool_calls_paired(persist, allow_trailing=True)
    assert _choice_interrupts(snap)


@pytest.mark.asyncio
async def test_extra_user_choice_in_same_step_gets_unused_tool_message(data_dir) -> None:
    from app.agent.tools.mode import SUGGEST_MODE_TOOL

    llm = _FakeLLM(
        [
            AIMessage(
                content="先确认。",
                tool_calls=[
                    {
                        "name": ASK_USER_TOOL,
                        "args": {"message": "先确认方向。", "questions": QUESTIONS_A},
                        "id": "call_a",
                        "type": "tool_call",
                    },
                    {
                        "name": SUGGEST_MODE_TOOL,
                        "args": {"mode": "plan", "message": "建议进 Plan"},
                        "id": "call_b",
                        "type": "tool_call",
                    },
                ],
            )
        ]
    )
    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "conv_unused_choice"}}
    program, _ = _plan_program("conv_unused_choice")
    with patch("app.agent.runtime.get_llm", return_value=llm):
        try:
            await graph.ainvoke(program, config)
        except GraphInterrupt:
            pass
    snap = await graph.aget_state(config)
    persist = list(snap.values.get("messages") or [])
    unused = [
        m
        for m in persist
        if isinstance(m, ToolMessage) and m.tool_call_id == "call_b"
    ]
    assert unused
    assert "未使用" in unused[0].content
    pending = snap.values.get("pending_user_choice") or {}
    assert pending.get("tool_call_id") == "call_a"
    assert_tool_calls_paired(persist, allow_trailing=True)


@pytest.mark.asyncio
async def test_resume_formats_frozen_question_set_even_if_llm_would_regenerate_ids(data_dir) -> None:
    """Resume must not re-run think before applying answers.

    If think restarted and the model emitted QUESTIONS_B, matching ANSWERS_A
    against those new ids would look like the user left everything blank.
    """
    llm = _FakeLLM(
        [
            AIMessage(
                content="先确认方向。",
                tool_calls=[
                    {
                        "name": ASK_USER_TOOL,
                        "args": {"message": "先确认方向。", "questions": QUESTIONS_A},
                        "id": "call_a",
                        "type": "tool_call",
                    }
                ],
            ),
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": ASK_USER_TOOL,
                        "args": {"message": "再确认一轮。", "questions": QUESTIONS_B},
                        "id": "call_b",
                        "type": "tool_call",
                    }
                ],
            ),
            AIMessage(content="已按 Roguelike 与科幻继续规划。"),
        ]
    )
    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "conv_user_choice_lifecycle"}}
    program = {
        "project_id": "proj_test",
        "mode": "plan",
        "instruction": "我想做一个项目",
        "messages": [HumanMessage(content="我想做一个项目")],
        "plan_markdown": "",
        "trigger": "",
    }

    with patch("app.agent.runtime.get_llm", return_value=llm):
        try:
            await graph.ainvoke(program, config)
        except GraphInterrupt:
            pass
        snap = await graph.aget_state(config)
        interrupts = []
        for task in snap.tasks or []:
            interrupts.extend(getattr(task, "interrupts", None) or [])
        assert interrupts, "expected User Choice interrupt"
        payload = interrupts[0].value
        assert [q["id"] for q in payload["questions"]] == ["core_loop", "theme"]

        try:
            await graph.ainvoke(Command(resume={"answers": ANSWERS_A}), config)
        except GraphInterrupt:
            pass
        snap = await graph.aget_state(config)

    tool_texts = [
        str(getattr(m, "content", "") or "")
        for m in (snap.values.get("messages") or [])
        if isinstance(m, ToolMessage)
    ]
    joined = "\n".join(tool_texts)
    assert "Roguelike 逐局探索" in joined
    assert "科幻/末世" in joined
    assert "整体体验基调？:" not in joined
    assert llm.calls, "continuation think must run after answers are applied"
    last_call = llm.calls[-1]
    assert_tool_calls_paired(last_call)
    last_tool = next(
        (m for m in reversed(last_call) if isinstance(m, ToolMessage)),
        None,
    )
    assert last_tool is not None
    assert "Roguelike 逐局探索" in str(last_tool.content)
    humans = [
        m
        for m in (snap.values.get("messages") or [])
        if isinstance(m, HumanMessage)
        and "【用户回答】" in str(getattr(m, "content", "") or "")
    ]
    assert humans == []
    answered = [
        event
        for event in (snap.values.get("events") or [])
        if isinstance(event, dict) and event.get("type") == "user_choice" and event.get("status") == "answered"
    ]
    assert answered


def _plan_program(thread_id: str) -> tuple[dict[str, Any], dict[str, str]]:
    return (
        {
            "project_id": "proj_test",
            "mode": "plan",
            "instruction": "我想做一个项目",
            "messages": [HumanMessage(content="我想做一个项目")],
            "plan_markdown": "",
            "trigger": "",
        },
        {"configurable": {"thread_id": thread_id}},
    )


def _ask_user_llm(*extra: AIMessage) -> _FakeLLM:
    first = AIMessage(
        content="先确认方向。",
        tool_calls=[
            {
                "name": ASK_USER_TOOL,
                "args": {"message": "先确认方向。", "questions": QUESTIONS_A},
                "id": "call_a",
                "type": "tool_call",
            }
        ],
    )
    return _FakeLLM([first, *extra])


@pytest.mark.asyncio
async def test_persist_live_ui_skips_checkpoint_write_while_interrupted(data_dir) -> None:
    llm = _ask_user_llm()
    graph = build_graph(MemorySaver())
    program, config = _plan_program("conv_choice_skip_persist")
    runtime = ConversationRuntime(graph)

    with patch("app.agent.runtime.get_llm", return_value=llm):
        try:
            await graph.ainvoke(program, config)
        except GraphInterrupt:
            pass

    snapshot = await runtime.load(config["configurable"]["thread_id"])
    assert snapshot.pending
    updated = []
    original = runtime.update

    async def _track(conversation_id: str, values: dict[str, Any]) -> None:
        updated.append(values)
        await original(conversation_id, values)

    runtime.update = _track  # type: ignore[method-assign]
    after = await persist_live_ui(runtime, config["configurable"]["thread_id"], snapshot)
    assert after.pending
    assert updated == []


@pytest.mark.asyncio
async def test_stream_post_update_keeps_user_choice_resumable(data_dir) -> None:
    """persist_live_ui after interrupt must not consume the HITL task.

    If aupdate_state clears the interrupt, resume has nothing to resume.
    """
    llm = _ask_user_llm(
        # Plan requires the answers to land in the panel before the turn ends.
        AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "write_plan",
                    "args": {
                        "title": "核心循环",
                        "plan_markdown": "## 目标\n- 规划核心循环\n\n## 待敲定的设计点\n- [x] 核心循环？（Roguelike）",
                    },
                    "id": "call_w",
                    "type": "tool_call",
                }
            ],
        ),
        AIMessage(content="已按 Roguelike 与科幻继续规划。"),
    )
    graph = build_graph(MemorySaver())
    program, config = _plan_program("conv_choice_stream_update")
    runtime = ConversationRuntime(graph)

    with patch("app.agent.runtime.get_llm", return_value=llm):
        try:
            await graph.ainvoke(program, config)
        except GraphInterrupt:
            pass

        snapshot = await runtime.load(config["configurable"]["thread_id"])
        assert snapshot.pending, "expected User Choice interrupt before UI persist"
        after = await persist_live_ui(
            runtime,
            config["configurable"]["thread_id"],
            snapshot,
        )
        assert after.pending, "post-stream snapshot load cleared User Choice"
        assert [q["id"] for q in (after.pending.get("questions") or [])] == [
            "core_loop",
            "theme",
        ]

        try:
            await graph.ainvoke(Command(resume={"answers": ANSWERS_A}), config)
        except GraphInterrupt:
            pass

    snap = await graph.aget_state(config)
    tool_texts = [
        str(getattr(m, "content", "") or "")
        for m in (snap.values.get("messages") or [])
        if isinstance(m, ToolMessage)
    ]
    assert any("Roguelike 逐局探索" in text for text in tool_texts)


@pytest.mark.asyncio
async def test_hold_step_workspace_write_is_on_disk_after_resume(
    data_dir, monkeypatch
) -> None:
    """Sibling write in the same Step as User Choice must hit disk immediately.

    Resume then replies in prose and never touches the file again. If the write
    only lived in checkpoint workspace_files, this assertion fails.
    """
    from app.agent.tools import permission as perm
    from app.docs import load_workspace

    monkeypatch.setattr(perm, "HITL_INTERRUPTS", True)

    llm = _FakeLLM(
        [
            AIMessage(
                content="先落下一份草稿。",
                tool_calls=[
                    {
                        "name": "workspace_write",
                        "args": {
                            "files": [{"path": "core.md", "content": "# 核心循环\n"}],
                        },
                        "id": "call_w",
                        "type": "tool_call",
                    },
                    {
                        "name": ASK_USER_TOOL,
                        "args": {"message": "先确认方向。", "questions": QUESTIONS_A},
                        "id": "call_a",
                        "type": "tool_call",
                    },
                ],
            ),
            AIMessage(content="已按 Roguelike 与科幻继续。"),
        ]
    )
    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "conv_hold_write"}}
    program = {
        "project_id": "proj_hold",
        "mode": "",
        "instruction": "设计核心循环",
        "messages": [HumanMessage(content="设计核心循环")],
        "trigger": "",
    }

    with patch("app.agent.runtime.get_llm", return_value=llm):
        try:
            await graph.ainvoke(program, config)
        except GraphInterrupt:
            pass
        snap = await graph.aget_state(config)
        interrupts = []
        for task in snap.tasks or []:
            interrupts.extend(getattr(task, "interrupts", None) or [])
        assert interrupts, "expected Tool Permission interrupt before the sibling write"
        payload = interrupts[0].value
        assert payload.get("type") == "tool_permission"
        call_id = payload["calls"][0]["id"]

        try:
            await graph.ainvoke(Command(resume={call_id: {"action": "accept"}}), config)
        except GraphInterrupt:
            pass
        assert load_workspace("proj_hold")["core.md"].startswith("# 核心循环")

        try:
            await graph.ainvoke(Command(resume={"answers": ANSWERS_A}), config)
        except GraphInterrupt:
            pass

    assert load_workspace("proj_hold")["core.md"].startswith("# 核心循环")

