"""suggest_mode (impl): bound so the model can emit it; Runtime freezes it."""

from __future__ import annotations

from typing import Literal, TYPE_CHECKING

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from app.agent.tools.deps import ASK, NORMAL, PLAN, normalize_mode
from app.agent.tools.plan_panel import HOLD_TOOL_MUST_NOT_RUN

if TYPE_CHECKING:
    from app.agent.tools.registry import ToolRegistry

SUGGEST_MODE_TOOL = "suggest_mode"
SUGGEST_MODE_VARIANT = "suggest_mode"

_MODE_LABELS = {PLAN: "Plan", ASK: "Ask", NORMAL: "Agent"}
_DEFAULT_MESSAGES = {
    PLAN: "这项改动范围较大，建议先进入 Plan。",
    ASK: "这轮更像是查阅，建议切到 Ask。",
    NORMAL: "这件事要真的改工作区，建议切到 Agent。",
}


def target_mode(value: str) -> str:
    """The tool spells Agent at rest as ``agent``; the rest of the code spells it ``''``."""
    return normalize_mode(value)


def mode_label(mode: str) -> str:
    return _MODE_LABELS[normalize_mode(mode)]


def default_message(mode: str) -> str:
    return _DEFAULT_MESSAGES[normalize_mode(mode)]


class SuggestModeArgs(BaseModel):
    mode: Literal["plan", "agent"] = Field(
        description=(
            "建议切换到的模式。plan：需要先规划再动手；agent：需要真正读写工作区。"
        )
    )
    message: str = Field(default="", description="向用户说明为何建议切换")
    reason: str = Field(default="", description="内部简短理由")


@tool(
    SUGGEST_MODE_TOOL,
    args_schema=SuggestModeArgs,
    description=(
        "建议用户切换对话模式并等待确认。"
        "范围过大、目标含糊或需要多步规划时建议 plan；"
        "当前只能只读、但用户想真正改工作区时建议 agent。"
        "调用后会暂停等待用户确认；不要用 JSON 或聊天正文代替此工具。"
    ),
)
def suggest_mode(mode: str, message: str = "", reason: str = "") -> str:
    raise RuntimeError(HOLD_TOOL_MUST_NOT_RUN)


def register(registry: ToolRegistry) -> None:
    def _hide_on_execute(view) -> bool:
        return (view.trigger or "").strip() != "execute_plan"

    registry.add(modes=(NORMAL, ASK), tools=[suggest_mode], visible=_hide_on_execute)
