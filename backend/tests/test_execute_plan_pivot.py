"""Tests for plan → execute-plan pivot helpers and defaults."""

from __future__ import annotations

from app.agent.plan.execute import execute_plan_instruction
from app.api.schemas import CreateConversationBody
from app.agent.plan.prompts import PLAN_SYSTEM_PROMPT, build_plan_workspace_prompt
from app.agent.studio.prompts import MAIN_AGENT_SYSTEM


def test_create_conversation_body_defaults_to_unset_mode() -> None:
    assert CreateConversationBody().mode == ""


def test_execute_plan_instruction_is_internal_work_order() -> None:
    text = execute_plan_instruction(".studio/plans/conv_x-1.md", "# Goals\n- ship vision")
    assert "execute_plan" in text
    assert ".studio/plans/conv_x-1.md" in text
    assert "# Goals" in text
    assert "开始构建" not in text


def test_plan_prompt_is_work_order_not_mini_gdd() -> None:
    assert "plan" in PLAN_SYSTEM_PROMPT
    assert "执行计划" in PLAN_SYSTEM_PROMPT
    assert "开始构建" not in PLAN_SYSTEM_PROMPT
    assert "完整设计正文" in PLAN_SYSTEM_PROMPT
    assert "不负责决定游戏设计方案" in PLAN_SYSTEM_PROMPT
    assert "拟处理文档范围" in PLAN_SYSTEM_PROMPT
    assert "拟写入/更新的文档路径" not in PLAN_SYSTEM_PROMPT
    assert "具体设计参数" in PLAN_SYSTEM_PROMPT


def test_plan_workspace_empty_forbids_pointless_list() -> None:
    block = build_plan_workspace_prompt("", workspace_summary="workspace: empty (README only)")
    assert "禁止" in block
    assert "列出目录" in block
    assert "设计文档类型" in block
    assert "完整文件树" in block


def test_agent_prompt_names_plan_and_execute() -> None:
    assert "execute_plan" in MAIN_AGENT_SYSTEM
    assert "进入 Plan" in MAIN_AGENT_SYSTEM


def test_prompts_require_chinese_docs() -> None:
    assert "中文文件名" in MAIN_AGENT_SYSTEM
    assert "愿景.md" in MAIN_AGENT_SYSTEM
    assert "文档正文用中文" in MAIN_AGENT_SYSTEM
    assert "中文文件名" in PLAN_SYSTEM_PROMPT
    assert "愿景.md" in PLAN_SYSTEM_PROMPT
    text = execute_plan_instruction(".studio/plans/conv_x-1.md", "# 目标\n- 写愿景")
    assert "中文文件名" in text
    assert "正文用中文" in text
    assert "文档范围" in text
    assert "具体方案由本轮" in text


def test_execute_plan_does_not_ask_agent_to_read_the_snapshot() -> None:
    """The plan body is inlined; .studio/ is unreachable from workspace tools."""
    text = execute_plan_instruction(".studio/plans/conv_x-1.md", "# 目标\n- 写愿景")
    assert "请读取 plan 副本" not in text
    assert "无需也无法读取" in text
    assert "plan 正文已内嵌" in text
