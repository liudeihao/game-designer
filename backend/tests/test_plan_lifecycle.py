"""A plan is a named artifact with a lifecycle, not a field the conversation keeps rewriting."""

from __future__ import annotations

from unittest.mock import patch

from app.agent.plan.progress import plan_progress_from_markdown
from app.agent.plan.prompts import PLAN_SYSTEM_PROMPT
from app.agent.plan.status import (
    PLAN_DRAFTING,
    PLAN_EXECUTED,
    PLAN_READY,
    plan_to_resume,
)
from app.agent.tools import tools_for
from app.agent.tools.plan_panel import (
    UPDATE_PLAN_TOOL,
    WRITE_PLAN_TOOL,
)

PLAN = "## 待敲定的设计点\n- [x] 战斗节奏（快节奏）\n- [ ] 死亡惩罚\n"


def _names(*, plan_exists: bool) -> set[str]:
    return {getattr(t, "name", "") for t in tools_for("plan", plan_exists=plan_exists)}


def test_an_unexecuted_draft_is_resumed() -> None:
    assert plan_to_resume(PLAN, "核心战斗循环", PLAN_READY) == (PLAN.strip(), "核心战斗循环")
    assert plan_to_resume(PLAN, "核心战斗循环", PLAN_DRAFTING) == (PLAN.strip(), "核心战斗循环")


def test_an_executed_plan_is_not_resumed() -> None:
    assert plan_to_resume(PLAN, "核心战斗循环", PLAN_EXECUTED) == ("", "")


def test_the_round_after_execute_plan_writes_a_new_plan_rather_than_updating() -> None:
    """The user's second Plan round should not land on the plan already built."""
    resumed, title = plan_to_resume(PLAN, "核心战斗循环", PLAN_EXECUTED)
    assert WRITE_PLAN_TOOL in _names(plan_exists=bool(resumed))
    assert UPDATE_PLAN_TOOL not in _names(plan_exists=bool(resumed))


def test_a_draft_round_keeps_updating_the_same_plan() -> None:
    resumed, title = plan_to_resume(PLAN, "核心战斗循环", PLAN_READY)
    names = _names(plan_exists=bool(resumed))
    assert UPDATE_PLAN_TOOL in names
    assert WRITE_PLAN_TOOL not in names


def test_update_plan_description_is_static() -> None:
    tools = tools_for("plan", plan_exists=True)
    update = next(t for t in tools if getattr(t, "name", "") == UPDATE_PLAN_TOOL)
    assert "plan" in (update.description or "").lower()


def test_plan_prompt_asks_for_a_name_and_says_executed_plans_are_closed() -> None:
    assert "title" in PLAN_SYSTEM_PROMPT
    assert "执行后即归档" in PLAN_SYSTEM_PROMPT
    assert "不要去改它们" in PLAN_SYSTEM_PROMPT


def test_a_plan_without_open_questions_projects_to_nothing() -> None:
    """Section headings are document structure, not design points to settle."""
    plan = "## 目标\n- 定核心循环\n\n## 非目标\n- 不做数值\n\n## 开放问题\n- 难度曲线\n"
    assert plan_progress_from_markdown(plan) == {"steps": []}


def test_writing_a_plan_records_its_name() -> None:
    from app.agent.context import AgentContext
    from app.agent.tools.inject import fake_tool_runtime

    tools = tools_for("plan", plan_exists=False)
    write = next(t for t in tools if getattr(t, "name", "") == WRITE_PLAN_TOOL)
    runtime = fake_tool_runtime(state={"mode": "plan"}, context=AgentContext(mode="plan"))
    with patch("app.agent.tools.plan_panel.emit_plan"):
        result = write.func(title="开局 10 分钟体验", plan_markdown=PLAN, runtime=runtime)
    assert result.update["plan_title"] == "开局 10 分钟体验"
