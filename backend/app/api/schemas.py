"""Pydantic request bodies for the HTTP API."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, model_validator


class CreateProjectBody(BaseModel):
    name: str = "未命名游戏"


class RenameProjectBody(BaseModel):
    """Partial project update. Omit a field to leave it unchanged."""

    name: Optional[str] = None
    label: Optional[str] = None


class CreateConversationBody(BaseModel):
    title: str = "新对话"
    mode: str = ""  # plan | ask | "" (unset = Agent at rest)
    folder_id: Optional[str] = None


class RenameConversationBody(BaseModel):
    title: Optional[str] = None
    folder_id: Optional[str] = None


class CreateFolderBody(BaseModel):
    name: str = "未命名文件夹"


class RenameFolderBody(BaseModel):
    name: str


class ChatBody(BaseModel):
    instruction: str
    model: Optional[str] = None  # optional per-turn model override (catalog key or model id)


class ResumeBody(BaseModel):
    decisions: dict[str, Any] = {}


class RuleItemBody(BaseModel):
    id: Optional[str] = None
    name: str = ""
    details: str = ""


class RuleBody(BaseModel):
    rules: list[RuleItemBody] = []


class RuleProposalBody(BaseModel):
    action: str  # accept | ignore
    scope: Optional[str] = None
    operation: Optional[str] = None
    name: Optional[str] = None
    details: Optional[str] = None
    text: Optional[str] = None  # legacy alias for details


class DocsFileWriteBody(BaseModel):
    """Write or delete one docs markdown file (``content=None`` deletes)."""

    content: Optional[str] = None
    based_on_rev: Optional[int] = None


class ModelBody(BaseModel):
    id: str
    label: str = ""
    context_window: int = 0
    max_output_tokens: int = 0

    @model_validator(mode="before")
    @classmethod
    def _accept_bare_string(cls, value: Any):
        if isinstance(value, str):
            return {"id": value.strip()}
        return value


class ProviderBody(BaseModel):
    id: Optional[str] = None
    label: str = ""
    base_url: str = ""
    api_key: Optional[str] = None
    models: list[ModelBody] = []


class LLMConfigBody(BaseModel):
    providers: Optional[list[ProviderBody]] = None
    active_provider_id: Optional[str] = None
    model: Optional[str] = None
    utility_provider_id: Optional[str] = None
    utility_model: Optional[str] = None
    # Legacy single-endpoint fields (still accepted for migration / simple clients)
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    available_models: Optional[list[str]] = None
