"""Pydantic schemas and observation helpers for workspace tools."""

from __future__ import annotations

from typing import Annotated, Any

from langchain_core.tools import InjectedToolArg
from pydantic import BaseModel, Field

# Always available for Studio / Ask (read-only unless writable=True).
WORKSPACE_READ_TOOL_IDS: tuple[str, ...] = (
    "workspace.list",
    "workspace.read",
    "workspace.grep",
    "conversation.get_summary",
)

WORKSPACE_WRITE_TOOL_IDS: tuple[str, ...] = (
    "workspace.write",
    "workspace.search_replace",
    "workspace.delete",
)

# ToolRuntime is not a Pydantic field type. InjectedToolArg hides it from the model.
InjectedRuntime = Annotated[Any, InjectedToolArg]


class WithInjectedRuntime(BaseModel):
    """Keep ToolNode-injected runtime on args_schema.

    langchain_core 1.4 reads postponed annotations as strings and then drops
    extra fields during validation. Without this field the tool is called
    without ``runtime``.
    """

    runtime: InjectedRuntime = None


class WorkspaceListArgs(WithInjectedRuntime):
    path: str = Field(
        default="",
        description="相对 docs/ 的路径；空=根目录。例：系统 或空字符串。",
    )


class WorkspaceReadArgs(WithInjectedRuntime):
    path: str = Field(
        description=(
            "相对 docs/ 的文件路径。例：战斗.md、系统/经济.md。"
        )
    )


class WorkspaceGrepArgs(WithInjectedRuntime):
    pattern: str = Field(description="正则或关键字，在 docs/ 文件内容中搜索")
    path: str = Field(default="", description="可选：限制在某目录或文件下")
    max_matches: int = Field(default=40, ge=1, le=200)


class FileWriteItem(BaseModel):
    path: str = Field(
        ...,
        description="相对 docs/ 的文件路径，如 战斗.md 或 系统/经济.md；含子目录时目录随文件创建",
    )
    content: str = Field(
        ...,
        description="文件的完整 Markdown 文本内容",
    )


class WorkspaceWriteArgs(WithInjectedRuntime):
    files: list[FileWriteItem] = Field(
        ...,
        description="需要写入的文件列表（新建或整份覆写），形如 [{path, content}, ...]",
    )


class WorkspaceSearchReplaceArgs(WithInjectedRuntime):
    path: str = Field(..., description="要修改的已有 Markdown 文件相对路径")
    old: str = Field(..., description="要替换的原文（首次出现）")
    new: str = Field(..., description="替换后的文本")


class WorkspaceDeleteArgs(WithInjectedRuntime):
    paths: list[str] = Field(
        ...,
        description="要从工作树删除的相对路径列表，例: ['系统/旧稿.md']",
    )


class ConversationSummaryArgs(WithInjectedRuntime):
    reason: str = Field(default="", description="可选：说明为何需要读取对话摘要")


def _jsonable(result: Any) -> str:
    import json

    try:
        return json.dumps(result, ensure_ascii=False, default=str)
    except Exception:
        return str(result)


def _observe(result: Any) -> str:
    """JSON observation. ``ok: false`` fails the Tool Call so Event outcome is error."""
    text = _jsonable(result)
    if isinstance(result, dict) and result.get("ok") is False:
        raise RuntimeError(text)
    return text


def _write_payload(files: list[Any]) -> list[dict[str, Any]]:
    """LangChain passes nested FileWriteItem models; session.write only takes dicts."""
    payload: list[dict[str, Any]] = []
    for item in files:
        if isinstance(item, dict):
            payload.append(item)
        else:
            payload.append(item.model_dump())
    return payload
