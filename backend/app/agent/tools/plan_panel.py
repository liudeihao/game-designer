"""Plan-mode tools: User Choice plus write/update plan. No docs/ writes."""

from __future__ import annotations

from typing import Any, Optional, TYPE_CHECKING

from langchain_core.tools import tool
from langgraph.prebuilt import ToolRuntime
from langgraph.types import Command
from pydantic import BaseModel, Field

from app.agent.helpers import emit_plan
from app.agent.loop import extract_answers
from app.agent.plan.status import PLAN_READY
from app.agent.tools.deps import NORMAL, PLAN
from app.agent.tools.inject import mode_denied, tool_command
from app.agent.tools.schemas import WithInjectedRuntime
from app.docs import plan_title_from_markdown

if TYPE_CHECKING:
    from app.agent.tools.registry import ToolRegistry

ASK_USER_TOOL = "ask_user"
WRITE_PLAN_TOOL = "write_plan"
UPDATE_PLAN_TOOL = "update_plan"
USER_CHOICE_PENDING = "user_choice"
HOLD_TOOL_MUST_NOT_RUN = "User Choice 由 Runtime 冻结，不能在 Tool Node 内执行。"

PLAN_WRITE_TOOLS = frozenset({WRITE_PLAN_TOOL, UPDATE_PLAN_TOOL})


class PlanQuestionOption(BaseModel):
    id: str = Field(description="选项 id")
    label: str = Field(description="选项文案")


class PlanQuestion(BaseModel):
    id: str = Field(description="问题 id")
    prompt: str = Field(description="题干")
    options: list[PlanQuestionOption] = Field(
        default_factory=list,
        description="2–4 个选项；可为空，用户可自由输入 Other",
    )
    allow_multiple: bool = False


class AskUserArgs(BaseModel):
    message: str = Field(
        default="在继续之前，我想先确认几件事：",
        description="聊天区短引言，不要在这里列出题干或选项",
    )
    questions: list[PlanQuestion] = Field(
        ...,
        min_length=1,
        description=(
            "需要用户作答的 User Choice，一次 1–4 题。"
            "前端逐题翻页，答完全部才一起回传，所以每题都要能独立作答，"
            "不要把后一题的题干写成依赖前一题的选择。"
        ),
    )


class WritePlanArgs(WithInjectedRuntime):
    title: str = Field(
        description=(
            "这份 plan 的名称，一句短中文概括它要规划什么"
            "（如「核心战斗循环」「开局 10 分钟体验」）。不要写成「计划」这种空名。"
        )
    )
    plan_markdown: str = Field(
        description=(
            "完整 Markdown plan，章节结构见 system prompt 的 plan 结构一节。"
            "不要写成完整设计散文，不要写入未经确认的具体设计参数。"
        )
    )


def _dump_questions(questions: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in questions:
        if hasattr(item, "model_dump"):
            out.append(item.model_dump())
        elif isinstance(item, dict):
            out.append(item)
    return out


def pending_from_ask_user_call(call: Any) -> dict[str, Any]:
    """Freeze one ask_user tool call as the User Choice interrupt payload."""
    if isinstance(call, dict):
        args = call.get("args") or call.get("arguments") or {}
        call_id = str(call.get("id") or "")
    else:
        args = getattr(call, "args", None) or {}
        call_id = str(getattr(call, "id", "") or "")
    if not isinstance(args, dict):
        args = {}
    questions = _dump_questions(args.get("questions") or [])
    intro = str(args.get("message") or "").strip() or "在继续之前，我想先确认几件事："
    return {
        "type": USER_CHOICE_PENDING,
        "variant": "questions",
        "message": intro,
        "questions": questions,
        "tool_call_id": call_id or ASK_USER_TOOL,
    }


def answer_text(question: dict[str, Any], raw: Any) -> str:
    """Render one answer as option labels. Multi-select answers arrive as a list."""
    labels = {
        str(option.get("id")): str(option.get("label") or "")
        for option in question.get("options") or []
        if isinstance(option, dict)
    }
    values = raw if isinstance(raw, list) else [raw]
    picked = [str(value or "") for value in values]
    return "、".join(labels.get(value) or value for value in picked if value)


def observation_from_answers(questions: list[dict[str, Any]], result: Any) -> str:
    """Format answers against this frozen question set. Do not use a later set."""
    if isinstance(result, dict) and result.get("action") == "skip":
        note = str(result.get("message") or "").strip() or "（无补充）"
        return f"用户未点选选项，改为自由说明：{note}"
    answers = extract_answers(result)
    lines: list[str] = []
    for question in questions:
        qid = str(question.get("id") or "")
        prompt = str(question.get("prompt") or qid)
        lines.append(f"- {prompt}: {answer_text(question, answers.get(qid, ''))}")
    return (
        "【用户对以下澄清问题的回答】\n"
        + "\n".join(lines)
        + "\n请严格据此推进本轮工作，不要重复提问已答过的内容。"
    )


def answer_items_from_result(questions: list[dict[str, Any]], result: Any) -> list[dict[str, str]]:
    """UI-facing prompt/answer pairs bound to the frozen question set."""
    if isinstance(result, dict) and result.get("action") == "skip":
        note = str(result.get("message") or "").strip() or "（无补充）"
        return [{"prompt": "（跳过结构化确认）", "answer": note}]
    answers = extract_answers(result)
    items: list[dict[str, str]] = []
    for question in questions:
        qid = str(question.get("id") or "")
        prompt = str(question.get("prompt") or qid)
        items.append({"prompt": prompt, "answer": answer_text(question, answers.get(qid, ""))})
    return items


@tool(
    ASK_USER_TOOL,
    args_schema=AskUserArgs,
    description=(
        "向用户提出 User Choice 并等待选择。关键信息不足时调用。"
        "题干与选项只放在参数里，不要写进聊天正文。"
        "不要问平台、引擎或技术实现。调用后会暂停；不要用聊天正文代替此工具。"
    ),
)
def ask_user(
    message: str = "在继续之前，我想先确认几件事：",
    questions: Optional[list[Any]] = None,
) -> str:
    raise RuntimeError(HOLD_TOOL_MUST_NOT_RUN)


def _commit_plan(
    runtime: ToolRuntime,
    title: str,
    plan_markdown: str,
    *,
    is_update: bool,
) -> Command:
    name_tool = UPDATE_PLAN_TOOL if is_update else WRITE_PLAN_TOOL
    denied = mode_denied(runtime, name_tool, {PLAN})
    if denied:
        return tool_command(runtime, denied)
    md = (plan_markdown or "").strip()
    if not md:
        raise ValueError("plan_markdown 不能为空。")
    state = runtime.state if isinstance(runtime.state, dict) else {}
    existing_title = str(state.get("plan_title") or "").strip()
    name = (title or "").strip() or existing_title or plan_title_from_markdown(md)
    emit_plan(md, title=name)
    text = f"已{'更新' if is_update else '生成'} plan「{name}」"
    return tool_command(
        runtime,
        text,
        extra={
            "plan_markdown": md,
            "plan_title": name,
            "plan_status": PLAN_READY,
        },
    )


@tool(
    WRITE_PLAN_TOOL,
    args_schema=WritePlanArgs,
    description=(
        "为本次规划新建一份 plan 并写入右侧。信息足够、可以产出计划时调用。"
        "title 是这份 plan 的名称，会显示在面板上并在执行后归档。"
    ),
)
def write_plan(
    title: str, plan_markdown: str, runtime: ToolRuntime = None
) -> Command:  # type: ignore[assignment]
    return _commit_plan(runtime, title, plan_markdown, is_update=False)


@tool(
    UPDATE_PLAN_TOOL,
    args_schema=WritePlanArgs,
    description=(
        "用完整 plan 替换本对话正在写的 plan。"
        "信息足够、用户要求修改或确认后调用。"
        "题目变了可以改 title；仍是同一件事就沿用原 title。"
    ),
)
def update_plan(
    title: str, plan_markdown: str, runtime: ToolRuntime = None
) -> Command:  # type: ignore[assignment]
    return _commit_plan(runtime, title, plan_markdown, is_update=True)


def plan_trace_kind(name: str) -> str:
    return "plan" if name in PLAN_WRITE_TOOLS else "tool"


def _hide_on_execute(view) -> bool:
    return (view.trigger or "").strip() != "execute_plan"


def register(registry: ToolRegistry) -> None:
    registry.add(
        modes=(NORMAL, PLAN),
        tools=[ask_user],
        visible=_hide_on_execute,
    )
    registry.add(
        modes=(PLAN,),
        tools=[write_plan],
        visible=lambda view: not view.plan_exists,
    )
    registry.add(
        modes=(PLAN,),
        tools=[update_plan],
        visible=lambda view: view.plan_exists,
    )
