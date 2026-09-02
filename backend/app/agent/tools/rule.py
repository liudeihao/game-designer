"""propose_rule: show a Rule Proposal card. Does not write and does not wait."""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from app.agent.tools.deps import ASK, NORMAL, PLAN
from app.rules import PROPOSE_RULE_TOOL, normalize_proposal_args

if TYPE_CHECKING:
    from app.agent.tools.registry import ToolRegistry


class ProposeRuleArgs(BaseModel):
    scope: Literal["user", "project"] = Field(
        description="user=跨项目的 User Rule；project=仅本项目的 Project Rule"
    )
    operation: Literal["add", "update", "delete"] = Field(
        description="add 新增一条；update 按名称改详情；delete 按名称删除"
    )
    name: str = Field(description="这条 Rule 的短名称。同一层级内应唯一；update / delete 用已有名称定位")
    details: str = Field(
        default="",
        description="这条 Rule 的详情。delete 可空；add / update 必填",
    )


@tool(
    PROPOSE_RULE_TOOL,
    args_schema=ProposeRuleArgs,
    description=(
        "出示一条具名 Rule Proposal（工作约定，不是设计设定，也不是权限）。"
        "每条 Rule 有名称与详情，不是一段要拼进整份 Rule 的原文。"
        "用户确认后才落盘；调用后立即返回，不要等待。"
        "scope=user 跨项目，scope=project 仅本项目。"
        "operation=add 新增，update 按名称改详情，delete 按名称删除。"
        "update / delete 用已注入 Context 的 Rule 名称定位。"
        "同一轮只调用一次。用户忽略过的同一条不要再提，除非用户明确要求写成 Rule。"
    ),
)
def propose_rule(
    scope: str = "project",
    operation: str = "add",
    name: str = "",
    details: str = "",
) -> str:
    payload = normalize_proposal_args(
        {"scope": scope, "operation": operation, "name": name, "details": details}
    )
    if not payload["name"]:
        raise ValueError("缺少 Rule 名称。每条提案都必须有 name。")
    if payload["operation"] != "delete" and not payload["details"]:
        raise ValueError("缺少详情。add / update 必须提供 details。")
    return (
        "已向用户出示 Rule Proposal，等待其在卡片上确认。"
        "不要假装已经写入。继续把这轮话说完。"
    )


def register(registry: ToolRegistry) -> None:
    def _hide_on_execute(view) -> bool:
        return (view.trigger or "").strip() != "execute_plan"

    registry.add(
        modes=(ASK, PLAN, NORMAL),
        tools=[propose_rule],
        visible=_hide_on_execute,
    )
