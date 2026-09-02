"""Plan-mode ReAct tools: ask_user interrupt and write/update plan."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.errors import GraphInterrupt

from app.api.stream import dispatch_custom
from app.graph import build_graph
from app.agent.context import AgentContext
from app.agent.tools.choice import interrupt_payload, pending_from_user_choice_call
from app.agent.tools import tools_for
from app.agent.tools.inject import fake_tool_runtime
from app.agent.tools.plan_panel import (
    ASK_USER_TOOL,
    HOLD_TOOL_MUST_NOT_RUN,
    UPDATE_PLAN_TOOL,
    WRITE_PLAN_TOOL,
    answer_items_from_result,
    observation_from_answers,
    plan_trace_kind,
)


def _tool(tools: list, name: str):
    return next(t for t in tools if getattr(t, "name", "") == name)


def _cmd_text(result) -> str:
    msgs = (result.update or {}).get("messages") or []
    return str(msgs[0].content) if msgs else ""


def _plan_runtime(*, title: str = "", markdown: str = ""):
    return fake_tool_runtime(
        state={"plan_title": title, "plan_markdown": markdown, "mode": "plan"},
        context=AgentContext(mode="plan"),
    )


def test_plan_trace_kind_marks_write_tools() -> None:
    assert plan_trace_kind("write_plan") == "plan"
    assert plan_trace_kind("update_plan") == "plan"
    assert plan_trace_kind("ask_user") == "tool"
    assert plan_trace_kind("workspace_read") == "tool"


def test_write_plan_stores_markdown_and_emits() -> None:
    tool = _tool(tools_for("plan", plan_exists=False), WRITE_PLAN_TOOL)
    md = "# Goals\n- ship vision"
    runtime = _plan_runtime()
    with patch("app.agent.tools.plan_panel.emit_plan") as emit_plan:
        result = tool.func(title="开局体验", plan_markdown=md, runtime=runtime)
    assert _cmd_text(result) == "已生成 plan「开局体验」"
    assert result.update["plan_markdown"] == md
    assert result.update["plan_title"] == "开局体验"
    emit_plan.assert_called_once_with(md, title="开局体验")


def test_write_plan_falls_back_to_the_h1_when_title_is_blank() -> None:
    tool = _tool(tools_for("plan", plan_exists=False), WRITE_PLAN_TOOL)
    runtime = _plan_runtime()
    with patch("app.agent.tools.plan_panel.emit_plan"):
        result = tool.func(
            title="  ",
            plan_markdown="# 核心战斗循环\n- ship",
            runtime=runtime,
        )
    assert result.update["plan_title"] == "核心战斗循环"


def test_update_plan_keeps_the_existing_title_when_none_is_given() -> None:
    tool = _tool(tools_for("plan", plan_exists=True), UPDATE_PLAN_TOOL)
    runtime = _plan_runtime(title="开局体验", markdown="# 旧计划")
    with patch("app.agent.tools.plan_panel.emit_plan"):
        result = tool.func(title="", plan_markdown="# 目标\n- 改过了", runtime=runtime)
    assert _cmd_text(result) == "已更新 plan「开局体验」"
    assert result.update["plan_title"] == "开局体验"


def test_write_plan_rejects_empty_markdown() -> None:
    tool = _tool(tools_for("plan", plan_exists=False), WRITE_PLAN_TOOL)
    runtime = _plan_runtime()
    with pytest.raises(ValueError, match="不能为空"):
        tool.func(title="开局体验", plan_markdown="  ", runtime=runtime)


@pytest.mark.asyncio
async def test_write_plan_tool_node_injects_runtime() -> None:
    from app.agent.tools.node import run_tool_node

    tool = _tool(tools_for("plan", plan_exists=False), WRITE_PLAN_TOOL)
    schema = tool.tool_call_schema.model_json_schema()
    assert "runtime" not in (schema.get("properties") or {})
    md = "# Goals\n- ship"
    with patch("app.agent.tools.plan_panel.emit_plan"):
        _messages, extra, results = await run_tool_node(
            {"project_id": "proj_wp", "mode": "plan", "plan_markdown": ""},
            [tool],
            [
                {
                    "id": "c1",
                    "name": WRITE_PLAN_TOOL,
                    "args": {"title": "Goals", "plan_markdown": md},
                    "type": "tool_call",
                }
            ],
        )
    assert results[0]["ok"] is True
    assert extra.get("plan_markdown") == md
    assert extra.get("plan_title") == "Goals"


def test_ask_user_must_not_execute() -> None:
    tool = _tool(tools_for("plan", plan_exists=False), ASK_USER_TOOL)
    with pytest.raises(RuntimeError, match="冻结"):
        tool.invoke(
            {
                "message": "先确认节奏。",
                "questions": [
                    {
                        "id": "q1",
                        "prompt": "偏什么节奏？",
                        "options": [{"id": "casual", "label": "休闲"}],
                    }
                ],
            }
        )
    assert HOLD_TOOL_MUST_NOT_RUN


def test_ask_user_pending_then_formats_answers() -> None:
    questions = [
        {
            "id": "q1",
            "prompt": "偏什么节奏？",
            "options": [{"id": "casual", "label": "休闲"}],
        }
    ]
    pending = pending_from_user_choice_call(
        {
            "name": ASK_USER_TOOL,
            "id": "c1",
            "args": {"message": "先确认节奏。", "questions": questions},
        }
    )
    payload = interrupt_payload(pending)
    assert payload["type"] == "user_choice"
    assert payload["variant"] == "questions"
    assert payload["questions"][0]["id"] == "q1"
    observation = observation_from_answers(payload["questions"], {"answers": {"q1": "casual"}})
    assert "休闲" in observation
    assert "偏什么节奏" in observation


def test_ask_user_renders_every_label_of_a_multi_select_answer() -> None:
    questions = [
        {
            "id": "q1",
            "prompt": "想保留哪些系统？",
            "options": [
                {"id": "craft", "label": "合成"},
                {"id": "trade", "label": "交易"},
                {"id": "farm", "label": "种田"},
            ],
            "allow_multiple": True,
        }
    ]
    observation = observation_from_answers(questions, {"answers": {"q1": ["craft", "farm"]}})
    assert "合成、种田" in observation
    assert "craft" not in observation

    items = answer_items_from_result(questions, {"answers": {"q1": ["craft", "farm"]}})
    assert items == [{"prompt": "想保留哪些系统？", "answer": "合成、种田"}]


def test_ask_user_skip_becomes_observation() -> None:
    questions = [{"id": "q1", "prompt": "类型？", "options": []}]
    observation = observation_from_answers(questions, {"action": "skip", "message": "做成塔防"})
    assert "塔防" in observation


def test_dispatch_custom_plan_event() -> None:
    event, data = dispatch_custom(
        {"type": "plan", "markdown": "# Goals\n- [ ] 死亡惩罚", "title": "核心战斗循环"}
    )
    assert event == "plan"
    assert data["markdown"] == "# Goals\n- [ ] 死亡惩罚"
    assert data["title"] == "核心战斗循环"
    assert data["progress"]["steps"][0]["title"] == "死亡惩罚"


@pytest.mark.asyncio
async def test_graph_continues_after_write_plan(data_dir) -> None:
    class _LLM:
        def __init__(self) -> None:
            self.n = 0

        def bind_tools(self, _tools):
            return self

        async def astream(self, messages):
            self.n += 1
            if self.n == 1:
                yield AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": "write_plan",
                            "args": {"title": "Goals", "plan_markdown": "# Goals\n- ship"},
                            "id": "c1",
                            "type": "tool_call",
                        }
                    ],
                )
                return
            yield AIMessage(content="计划已写到右侧，可继续讨论或执行。")

        async def ainvoke(self, messages):
            raise AssertionError("ainvoke should not be used")

    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "plan_write"}}
    program = {
        "project_id": "proj_plan_write",
        "mode": "plan",
        "instruction": "写计划",
        "messages": [HumanMessage(content="写计划")],
        "plan_markdown": "",
        "trigger": "",
    }
    with patch("app.agent.runtime.get_llm", return_value=_LLM()):
        with patch("app.agent.tools.plan_panel.emit_plan"):
            try:
                await graph.ainvoke(program, config)
            except GraphInterrupt:
                pass
    snap = await graph.aget_state(config)
    assert (snap.values.get("plan_markdown") or "").startswith("# Goals")
    messages = list(snap.values.get("messages") or [])
    assert any(getattr(m, "tool_calls", None) for m in messages)
    assert "右侧" in str(messages[-1].content)


def _long_plan_chat() -> str:
    return "史莱姆阵容\n" + "\n".join(
        f"{i}. 怪物{i}：外形圆滚滚，机制捣乱但不伤人，幽默点是自己先摔倒。"
        for i in range(1, 12)
    )


def _plan_program(project_id: str, instruction: str) -> dict:
    return {
        "project_id": project_id,
        "mode": "plan",
        "instruction": instruction,
        "messages": [HumanMessage(content=instruction)],
        "plan_markdown": "",
        "trigger": "",
    }


@pytest.mark.asyncio
async def test_plan_graph_unbound_write_redirects_without_permission(data_dir) -> None:
    seen_redirect = False

    class _LLM:
        def __init__(self) -> None:
            self.n = 0

        def bind_tools(self, _tools):
            return self

        async def astream(self, messages):
            nonlocal seen_redirect
            self.n += 1
            blob = "\n".join(str(getattr(m, "content", "")) for m in messages)
            if "write_plan" in blob and "workspace_write" in blob and "不要重试" in blob:
                seen_redirect = True
            if self.n == 1:
                yield AIMessage(
                    content="我来写入单独文件。",
                    tool_calls=[
                        {
                            "name": "workspace_write",
                            "args": {
                                "files": [{"path": "地牢与怪物/史莱姆图鉴.md", "content": "# x"}]
                            },
                            "id": "w1",
                            "type": "tool_call",
                        }
                    ],
                )
                return
            if self.n == 2:
                yield AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": "write_plan",
                            "args": {"title": "史莱姆归档", "plan_markdown": "# 目标\n归档史莱姆"},
                            "id": "p1",
                            "type": "tool_call",
                        }
                    ],
                )
                return
            yield AIMessage(content="已更新右侧 plan，可继续讨论或点击「执行计划」。")

        async def ainvoke(self, messages):
            raise AssertionError("ainvoke should not be used")

    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "plan_unbound"}}
    with patch("app.agent.runtime.get_llm", return_value=_LLM()):
        with patch("app.agent.tools.plan_panel.emit_plan"):
            try:
                await graph.ainvoke(_plan_program("proj_unbound", "写入单独文件吧"), config)
            except GraphInterrupt:
                pass
    snap = await graph.aget_state(config)
    assert seen_redirect is True
    assert (snap.values.get("plan_markdown") or "").startswith("# 目标")
    events = list(snap.values.get("events") or [])
    assert not any(e.get("type") == "tool_permission" for e in events)
    tool_texts = [
        str(getattr(m, "content", "") or "")
        for m in (snap.values.get("messages") or [])
        if isinstance(m, ToolMessage)
    ]
    miss = next(t for t in tool_texts if "workspace_write" in t or "write_plan" in t)
    assert "write_plan" in miss
    assert "Unknown tool" not in miss


@pytest.mark.asyncio
async def test_plan_graph_bounces_long_chat_and_hides_draft(data_dir) -> None:
    long = _long_plan_chat()
    tokens: list[str] = []

    class _LLM:
        def __init__(self) -> None:
            self.n = 0

        def bind_tools(self, _tools):
            return self

        async def astream(self, messages):
            self.n += 1
            if self.n == 1:
                yield AIMessage(content=long)
                return
            if self.n == 2:
                blob = "\n".join(str(getattr(m, "content", "")) for m in messages)
                assert "---草稿---" in blob
                assert "怪物1" in blob
                yield AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": "write_plan",
                            "args": {"title": "史莱姆归档", "plan_markdown": "# 目标\n归档史莱姆"},
                            "id": "p1",
                            "type": "tool_call",
                        }
                    ],
                )
                return
            yield AIMessage(content="已更新右侧 plan。")

        async def ainvoke(self, messages):
            raise AssertionError("ainvoke should not be used")

    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "plan_bounce"}}
    with patch("app.agent.runtime.get_llm", return_value=_LLM()):
        with patch("app.agent.tools.plan_panel.emit_plan"):
            with patch(
                "app.agent.nodes.llm.stream_token", side_effect=lambda t, node="": tokens.append(t)
            ):
                try:
                    await graph.ainvoke(_plan_program("proj_bounce", "多做几种史莱姆"), config)
                except GraphInterrupt:
                    pass
    snap = await graph.aget_state(config)
    messages = list(snap.values.get("messages") or [])
    assert (snap.values.get("plan_markdown") or "").startswith("# 目标")
    assert not any(long[:20] in str(getattr(m, "content", "")) for m in messages)
    assert not any(long[:20] in piece for piece in tokens)


@pytest.mark.asyncio
async def test_plan_graph_keeps_short_chat(data_dir) -> None:
    tokens: list[str] = []

    class _LLM:
        def bind_tools(self, _tools):
            return self

        async def astream(self, messages):
            yield AIMessage(content="先确认一层主题，还是直接出阵容？")

        async def ainvoke(self, messages):
            raise AssertionError("ainvoke should not be used")

    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "plan_short"}}
    with patch("app.agent.runtime.get_llm", return_value=_LLM()):
        with patch(
            "app.agent.nodes.llm.stream_token", side_effect=lambda t, node="": tokens.append(t)
        ):
            try:
                await graph.ainvoke(_plan_program("proj_short", "做第一层"), config)
            except GraphInterrupt:
                pass
    snap = await graph.aget_state(config)
    assert "一层主题" in str((snap.values.get("messages") or [])[-1].content)
    assert tokens == ["先确认一层主题，还是直接出阵容？"]

