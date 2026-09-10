"""Illustration tools: generate (Agent) and list (Ask / Plan / Agent)."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Literal

from langchain_core.tools import tool
from langgraph.prebuilt import ToolRuntime
from pydantic import BaseModel, Field

from app.agent.tools.deps import ASK, NORMAL, PLAN
from app.agent.tools.inject import runtime_workspace_id
from app.illustrations.service import (
    GENERATE_ILLUSTRATION_TOOL,
    LIST_ILLUSTRATIONS_TOOL,
    IllustrationError,
    generate_illustration,
    list_illustrations,
)

if TYPE_CHECKING:
    from app.agent.tools.registry import ToolRegistry


class GenerateIllustrationArgs(BaseModel):
    extras: str = Field(default="", description="用户当场加的视觉料，可空")
    use_style: bool | None = Field(
        default=None,
        description="是否带上项目风格。省略则用项目默认",
    )
    home: Literal["doc", "unbound", "draft"] = Field(
        default="unbound",
        description="落入哪里：doc=挂到一篇文档，unbound=项目未绑定，draft=草稿",
    )
    linked_doc: str = Field(
        default="",
        description="home=doc 时必填，路径相对 docs/，如 角色设计.md",
    )
    prompt: str = Field(
        default="",
        description="最终提示词。有则直接用，不再从文档全文拼接；空则由风格+加料+文档短描述编译",
    )


class ListIllustrationsArgs(BaseModel):
    linked_doc: str = Field(
        default="",
        description="只列出挂在这篇文档上的图；空则列出项目全部",
    )
    include_drafts: bool = Field(default=True, description="是否包含草稿")


def _project_id(runtime: ToolRuntime | None) -> str:
    if runtime is None:
        raise ValueError("缺少项目上下文。")
    pid = runtime_workspace_id(runtime)
    if not pid:
        raise ValueError("缺少项目上下文。")
    return pid


@tool(
    GENERATE_ILLUSTRATION_TOOL,
    args_schema=GenerateIllustrationArgs,
    description=(
        "根据项目风格、当场加料和（可选）一篇设计文档生成概念插画。"
        "不要把文档全文当作提示词。"
        "home=doc 时必须给 linked_doc。"
        "生成后图与提示词成对保存，不能改写旧图。"
        "未配置生图模型时会失败，请让用户去设置。"
    ),
)
async def generate_illustration_tool(
    extras: str = "",
    use_style: bool | None = None,
    home: str = "unbound",
    linked_doc: str = "",
    prompt: str = "",
    runtime: ToolRuntime = None,  # type: ignore[assignment]
) -> str:
    project_id = _project_id(runtime)
    state = getattr(runtime, "state", None) if runtime is not None else {}
    conversation_id = ""
    if isinstance(state, dict):
        conversation_id = str(state.get("conversation_id") or "")
    try:
        record = await generate_illustration(
            project_id,
            extras=extras,
            use_style=use_style,
            home=home,
            linked_doc=linked_doc or None,
            prompt=prompt,
            conversation_id=conversation_id or None,
        )
    except IllustrationError as exc:
        raise ValueError(str(exc)) from exc
    return json.dumps(record, ensure_ascii=False)


@tool(
    LIST_ILLUSTRATIONS_TOOL,
    args_schema=ListIllustrationsArgs,
    description="列出本项目已保存的概念插画记录（提示词、挂载文档、是否过期）。读不到图片像素。",
)
def list_illustrations_tool(
    linked_doc: str = "",
    include_drafts: bool = True,
    runtime: ToolRuntime = None,  # type: ignore[assignment]
) -> str:
    project_id = _project_id(runtime)
    rows = list_illustrations(
        project_id,
        linked_doc=linked_doc.strip() or None,
        include_drafts=include_drafts,
    )
    return json.dumps({"ok": True, "count": len(rows), "illustrations": rows}, ensure_ascii=False)


def register(registry: ToolRegistry) -> None:
    def _hide_on_execute(view) -> bool:
        return (view.trigger or "").strip() != "execute_plan"

    registry.add(
        modes=(NORMAL,),
        tools=[generate_illustration_tool],
        visible=_hide_on_execute,
    )
    registry.add(
        modes=(ASK, PLAN, NORMAL),
        tools=[list_illustrations_tool],
    )
