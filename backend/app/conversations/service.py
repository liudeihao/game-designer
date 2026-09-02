"""API-facing Conversation operations that touch both stores."""

from __future__ import annotations

from app.store import db

from .errors import (
    ConversationBadRequest,
    ConversationConflict,
    ConversationNotFound,
    FolderNotFound,
    PlanNotFound,
    ProjectNotFound,
    require_conversation,
)
from .runtime import ConversationRuntime, ConversationSnapshot
from .runs import RunRegistry
from ._detail import DetailOps
from ._lifecycle import LifecycleOps
from ._crud import CrudOps
from ._runs import ConversationRun, RunOps, complete_turn, stored_usage


class ConversationService(CrudOps, DetailOps, LifecycleOps, RunOps):
    """Application facade for conversation use cases."""

    def __init__(self, runtime: ConversationRuntime):
        self.runtime = runtime
        self.runs = RunRegistry()

    async def load_runtime(self, conversation_id: str) -> ConversationSnapshot:
        return await self.runtime.load(conversation_id)

    async def update_runtime(self, conversation_id: str, values: dict) -> None:
        await self.runtime.update(conversation_id, values)

    async def delete(self, conversation_id: str) -> str:
        """Delete checkpoint first, then the store row.

        If the thread delete fails, the store row stays so the client can retry.
        A later retry is safe: deleting a missing thread is a no-op.
        """
        require_conversation(conversation_id)
        await self.runtime.delete(conversation_id)
        db.delete_conversation(conversation_id)
        return conversation_id

    async def delete_project(self, project_id: str) -> None:
        """Drop every conversation thread before wiping the project store."""
        for conv in db.list_conversations(project_id):
            await self.runtime.delete(conv["id"])
        db.delete_project(project_id)


__all__ = [
    "ConversationBadRequest",
    "ConversationConflict",
    "ConversationNotFound",
    "ConversationRun",
    "ConversationService",
    "FolderNotFound",
    "PlanNotFound",
    "ProjectNotFound",
    "complete_turn",
    "stored_usage",
]
