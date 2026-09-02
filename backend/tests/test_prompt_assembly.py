"""Stable system prefix + last-human extras (prompt cache shape)."""

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from app.agent.prompt import assemble_turn_messages, repair_tool_call_pairing
from app.agent.studio.prompts import ASK_AGENT_SYSTEM, MAIN_AGENT_SYSTEM


def test_assemble_keeps_single_system_and_appends_instruction() -> None:
    history = [HumanMessage(content="做个塔防"), AIMessage(content="先对齐范围。")]
    msgs = assemble_turn_messages(
        system_prompt=MAIN_AGENT_SYSTEM,
        history=history,
        instruction="开始写愿景",
    )
    systems = [m for m in msgs if getattr(m, "type", "") == "system"]
    assert len(systems) == 1
    assert systems[0].content == MAIN_AGENT_SYSTEM
    assert msgs[-1].content == "开始写愿景"


def test_assemble_ask_uses_ask_prompt() -> None:
    msgs = assemble_turn_messages(
        system_prompt=ASK_AGENT_SYSTEM,
        history=[],
        instruction="现在有什么机制？",
    )
    assert msgs[0].content == ASK_AGENT_SYSTEM
    assert "Ask" in msgs[0].content or "只读" in msgs[0].content


def test_assemble_puts_workspace_suffix_on_last_human() -> None:
    history = [HumanMessage(content="偏休闲"), AIMessage(content="记下了。")]
    workspace = "## 当前工作区概览（只读）\n（工作区尚无设计内容）"
    msgs = assemble_turn_messages(
        system_prompt="plan-system",
        history=history,
        instruction="再确认受众",
        extra_suffix=workspace,
    )
    systems = [m for m in msgs if getattr(m, "type", "") == "system"]
    assert len(systems) == 1
    assert "再确认受众" in msgs[-1].content
    assert "工作区概览" in msgs[-1].content
    assert msgs[-1].type == "human"


def test_assemble_keeps_paired_ask_user_tool_result() -> None:
    history = [
        HumanMessage(content="我想做一个项目"),
        AIMessage(
            content="先确认几件事。",
            tool_calls=[
                {"name": "ask_user", "args": {}, "id": "call_a", "type": "tool_call"}
            ],
        ),
        ToolMessage(content="- 核心循环？: Roguelike", tool_call_id="call_a"),
        HumanMessage(content="【用户回答】\n- 核心循环？: Roguelike"),
    ]
    msgs = assemble_turn_messages(system_prompt="plan-system", history=history)
    tools = [m for m in msgs if isinstance(m, ToolMessage)]
    assert len(tools) == 1
    assert tools[0].tool_call_id == "call_a"
    held = next(m for m in msgs if isinstance(m, AIMessage) and getattr(m, "tool_calls", None))
    assert msgs[msgs.index(held) + 1] is tools[0]


def _paired_ids(messages: list) -> list[str]:
    """tool_call_ids still open when a non-tool message shows up."""
    pending: list[str] = []
    broken: list[str] = []
    for message in messages:
        if isinstance(message, ToolMessage):
            call_id = str(message.tool_call_id or "")
            assert call_id in pending, f"orphan tool message {call_id}"
            pending.remove(call_id)
            continue
        broken.extend(pending)
        pending.clear()
        for call in getattr(message, "tool_calls", None) or []:
            pending.append(str(call["id"]))
    return broken + pending


def _call(name: str, call_id: str) -> dict:
    return {"name": name, "args": {}, "id": call_id, "type": "tool_call"}


def test_assemble_repairs_ai_bubble_wedged_between_tool_calls_and_result() -> None:
    """update_plan + ask_user in one step: the plan confirmation split the pair."""
    history = [
        HumanMessage(content="帮我改一下计划"),
        AIMessage(
            content="",
            tool_calls=[_call("update_plan", "call_plan"), _call("ask_user", "call_ask")],
        ),
        ToolMessage(content="已更新 plan。", tool_call_id="call_plan"),
        AIMessage(content="已更新右侧 plan，可继续讨论或点击「执行计划」。"),
        ToolMessage(content="- 核心循环？: Roguelike", tool_call_id="call_ask"),
    ]
    msgs = assemble_turn_messages(system_prompt="plan-system", history=history)
    assert _paired_ids(msgs) == []
    ids = [m.tool_call_id for m in msgs if isinstance(m, ToolMessage)]
    assert ids == ["call_plan", "call_ask"]
    assert msgs[-1].content.startswith("已更新右侧 plan")


def test_repair_fills_in_a_choice_the_user_never_answered() -> None:
    history = [
        HumanMessage(content="帮我改一下计划"),
        AIMessage(
            content="",
            tool_calls=[_call("update_plan", "call_plan"), _call("ask_user", "call_ask")],
        ),
        ToolMessage(content="已更新 plan。", tool_call_id="call_plan"),
        HumanMessage(content="先不回答了，直接按第二版做"),
    ]
    out = repair_tool_call_pairing(history)
    assert _paired_ids(out) == []
    synthetic = next(m for m in out if isinstance(m, ToolMessage) and m.tool_call_id == "call_ask")
    assert "没有回包" in synthetic.content
    assert out[-1].content == "先不回答了，直接按第二版做"


def test_repair_drops_a_tool_result_whose_assistant_was_compacted_away() -> None:
    history = [
        ToolMessage(content="旧的工具结果", tool_call_id="call_gone"),
        HumanMessage(content="继续"),
    ]
    out = repair_tool_call_pairing(history)
    assert [type(m).__name__ for m in out] == ["HumanMessage"]


def test_repair_is_idempotent() -> None:
    history = [
        HumanMessage(content="改计划"),
        AIMessage(content="", tool_calls=[_call("ask_user", "call_ask")]),
    ]
    once = repair_tool_call_pairing(history)
    twice = repair_tool_call_pairing(once)
    assert [getattr(m, "content", "") for m in once] == [
        getattr(m, "content", "") for m in twice
    ]
    assert _paired_ids(twice) == []
