"""Domain errors for conversation use cases."""

from __future__ import annotations

from app.agent.tools.deps import NORMAL, normalize_mode
from app.store import db


class ConversationNotFound(Exception):
    def __init__(self, conversation_id: str, *, detail: str = "conversation not found"):
        super().__init__(detail)
        self.conversation_id = conversation_id
        self.detail = detail


class ProjectNotFound(Exception):
    def __init__(self, project_id: str):
        super().__init__(project_id)
        self.project_id = project_id


class FolderNotFound(Exception):
    def __init__(self, folder_id: str):
        super().__init__(folder_id)
        self.folder_id = folder_id


class PlanNotFound(Exception):
    def __init__(self, plan_path: str):
        super().__init__(plan_path)
        self.plan_path = plan_path


class ConversationConflict(Exception):
    """409: the conversation exists but this action is not allowed now."""


class ConversationBadRequest(Exception):
    """400: invalid input for a conversation use case."""


def conv_mode(conv: dict) -> str:
    """Internal Mode: plan | ask | '' (Agent at rest)."""
    raw = conv.get("mode")
    if not isinstance(raw, str):
        return NORMAL
    return normalize_mode(raw)


def require_conversation(conversation_id: str) -> dict:
    conv = db.get_conversation(conversation_id)
    if not conv:
        raise ConversationNotFound(conversation_id)
    return conv


def require_project(project_id: str) -> dict:
    project = db.get_project(project_id)
    if not project:
        raise ProjectNotFound(project_id)
    return project


def require_folder(folder_id: str) -> dict:
    folder = db.get_folder(folder_id)
    if not folder:
        raise FolderNotFound(folder_id)
    return folder
