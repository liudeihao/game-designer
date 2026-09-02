"""Conversation / folder store CRUD."""

from __future__ import annotations

from typing import Any

from app.agent.tools.deps import normalize_mode
from app.store import db

from .errors import ConversationBadRequest, require_conversation, require_folder, require_project


class CrudOps:
    def list(self, project_id: str) -> dict[str, Any]:
        require_project(project_id)
        return {
            "conversations": db.list_conversations(project_id),
            "folders": db.list_folders(project_id),
        }

    def list_folders(self, project_id: str) -> dict[str, Any]:
        require_project(project_id)
        return {"folders": db.list_folders(project_id)}

    def create_folder(self, project_id: str, name: str) -> dict[str, Any]:
        require_project(project_id)
        return db.create_folder(project_id, name)

    def rename_folder(self, folder_id: str, name: str) -> dict[str, Any]:
        folder = db.rename_folder(folder_id, name)
        if not folder:
            require_folder(folder_id)
        return folder

    def delete_folder(self, folder_id: str) -> str:
        require_folder(folder_id)
        db.delete_folder(folder_id)
        return folder_id

    def create(
        self,
        project_id: str,
        title: str,
        mode: str = "",
        folder_id: str | None = None,
    ) -> dict[str, Any]:
        require_project(project_id)
        mode = normalize_mode(mode)
        if folder_id:
            folder = require_folder(folder_id)
            if folder.get("project_id") != project_id:
                raise ConversationBadRequest("invalid folder_id")
        return db.create_conversation(project_id, title, mode, folder_id=folder_id)

    def rename(
        self,
        conversation_id: str,
        *,
        title: str | None = None,
        folder_id: Any = None,
        folder_set: bool = False,
    ) -> dict[str, Any]:
        conv = require_conversation(conversation_id)
        if title is not None:
            db.rename_conversation(conversation_id, title)
        if folder_set:
            if folder_id:
                folder = require_folder(folder_id)
                if folder.get("project_id") != conv["project_id"]:
                    raise ConversationBadRequest("invalid folder_id")
            db.set_conversation_folder(conversation_id, folder_id)
        return db.get_conversation(conversation_id) or conv
