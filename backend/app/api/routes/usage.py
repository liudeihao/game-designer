"""Usage tracking routes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from app.store import db

router = APIRouter()


@router.get("/api/usage")
async def usage_scopes_route(
    project_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    turn_id: Optional[str] = None,
):
    if conversation_id and not project_id:
        conv = db.get_conversation(conversation_id)
        if conv:
            project_id = conv["project_id"]
    return db.usage_scopes(
        project_id=project_id,
        conversation_id=conversation_id,
        turn_id=turn_id,
    )


@router.get("/api/usage/analytics")
async def usage_analytics_route(
    since: Optional[str] = None,
    until: Optional[str] = None,
    project_id: Optional[str] = None,
):
    return db.usage_analytics(since=since, until=until, project_id=project_id)
