"""Shared API helpers (conversation mode routing)."""

from __future__ import annotations

from fastapi import HTTPException

from app.agent.tools.deps import ASK, PLAN, normalize_mode
from app.conversations.errors import (
    ConversationBadRequest,
    ConversationConflict,
    ConversationNotFound,
    FolderNotFound,
    PlanNotFound,
    ProjectNotFound,
    conv_mode,
)

__all__ = ["conv_mode", "conversation_http", "public_mode"]


def public_mode(mode: str | None) -> str | None:
    """API Mode: plan | ask | null."""
    key = normalize_mode(mode)
    return key if key in (PLAN, ASK) else None


def conversation_http(exc: Exception) -> HTTPException:
    """Map conversation domain errors onto HTTP responses."""
    if isinstance(exc, ConversationNotFound):
        return HTTPException(status_code=404, detail=exc.detail)
    if isinstance(exc, ProjectNotFound):
        return HTTPException(status_code=404, detail="project not found")
    if isinstance(exc, FolderNotFound):
        return HTTPException(status_code=404, detail="folder not found")
    if isinstance(exc, PlanNotFound):
        return HTTPException(status_code=404, detail="plan snapshot not found")
    if isinstance(exc, ConversationConflict):
        return HTTPException(status_code=409, detail=str(exc) or "conflict")
    if isinstance(exc, ConversationBadRequest):
        return HTTPException(status_code=400, detail=str(exc) or "bad request")
    raise exc
