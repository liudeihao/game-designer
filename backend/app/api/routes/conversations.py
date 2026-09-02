"""Conversation, chat SSE, and Plan / Ask / Execute Plan routes."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.api.helpers import conversation_http
from app.api.stream import stream_conversation
from app.conversations import ConversationService
from app.conversations.errors import (
    ConversationBadRequest,
    ConversationConflict,
    ConversationNotFound,
    FolderNotFound,
    PlanNotFound,
    ProjectNotFound,
)
from app.api.schemas import (
    ChatBody,
    CreateConversationBody,
    CreateFolderBody,
    RenameConversationBody,
    RenameFolderBody,
    ResumeBody,
)

router = APIRouter()

_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}

_DOMAIN = (
    ConversationNotFound,
    ProjectNotFound,
    FolderNotFound,
    PlanNotFound,
    ConversationConflict,
    ConversationBadRequest,
)


def _conversations(request: Request) -> ConversationService:
    return request.app.state.conversations


def _sse(service: ConversationService, run) -> StreamingResponse:
    return StreamingResponse(
        stream_conversation(
            service,
            run.program,
            run.project_id,
            run.conversation_id,
            mode=run.mode,
            start_activity=run.start_activity,
        ),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.get("/api/projects/{project_id}/conversations")
async def list_conversations_route(request: Request, project_id: str):
    try:
        return _conversations(request).list(project_id)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc


@router.get("/api/projects/{project_id}/folders")
async def list_folders_route(request: Request, project_id: str):
    try:
        return _conversations(request).list_folders(project_id)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc


@router.post("/api/projects/{project_id}/folders")
async def create_folder_route(request: Request, project_id: str, body: CreateFolderBody):
    try:
        return _conversations(request).create_folder(project_id, body.name)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc


@router.patch("/api/folders/{folder_id}")
async def rename_folder_route(request: Request, folder_id: str, body: RenameFolderBody):
    try:
        return _conversations(request).rename_folder(folder_id, body.name)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc


@router.delete("/api/folders/{folder_id}")
async def delete_folder_route(request: Request, folder_id: str):
    try:
        deleted = _conversations(request).delete_folder(folder_id)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc
    return {"deleted": deleted}


@router.post("/api/projects/{project_id}/conversations")
async def create_conversation_route(request: Request, project_id: str, body: CreateConversationBody):
    try:
        return _conversations(request).create(
            project_id, body.title, body.mode, folder_id=body.folder_id
        )
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc


@router.patch("/api/conversations/{conversation_id}")
async def rename_conversation_route(
    request: Request, conversation_id: str, body: RenameConversationBody
):
    try:
        return _conversations(request).rename(
            conversation_id,
            title=body.title,
            folder_id=body.folder_id,
            folder_set="folder_id" in body.model_fields_set,
        )
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc


@router.delete("/api/conversations/{conversation_id}")
async def delete_conversation_route(request: Request, conversation_id: str):
    try:
        await _conversations(request).delete(conversation_id)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc
    return {"deleted": conversation_id}


@router.get("/api/conversations/{conversation_id}")
async def get_conversation_route(request: Request, conversation_id: str):
    try:
        return await _conversations(request).get_detail(conversation_id)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc


@router.get("/api/conversations/{conversation_id}/context-usage")
async def context_usage_route(
    request: Request, conversation_id: str, model: str = "", provider_id: str = ""
):
    try:
        return await _conversations(request).context_usage(
            conversation_id, model=model, provider_id=provider_id
        )
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc


@router.post("/api/conversations/{conversation_id}/compact")
async def compact_conversation_route(request: Request, conversation_id: str):
    try:
        return await _conversations(request).compact(conversation_id)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc


@router.post("/api/conversations/{conversation_id}/chat")
async def chat_route(request: Request, conversation_id: str, body: ChatBody):
    try:
        run = await _conversations(request).start_chat(
            conversation_id, body.instruction, model=body.model
        )
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc
    return _sse(_conversations(request), run)


@router.post("/api/conversations/{conversation_id}/stop")
async def stop_route(request: Request, conversation_id: str):
    try:
        stopping = _conversations(request).stop(conversation_id)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc
    return {"stopping": stopping}


@router.post("/api/conversations/{conversation_id}/resume")
async def resume_route(request: Request, conversation_id: str, body: ResumeBody):
    try:
        run = await _conversations(request).resume(conversation_id, body.decisions)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc
    return _sse(_conversations(request), run)


@router.post("/api/conversations/{conversation_id}/execute-plan")
async def execute_plan_route(request: Request, conversation_id: str):
    try:
        run = await _conversations(request).execute_plan(conversation_id)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc
    return _sse(_conversations(request), run)


@router.post("/api/conversations/{conversation_id}/enter-plan")
async def enter_plan_route(request: Request, conversation_id: str):
    try:
        return await _conversations(request).enter_plan(conversation_id)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc


@router.get("/api/conversations/{conversation_id}/plans")
async def list_plans_route(request: Request, conversation_id: str):
    try:
        return _conversations(request).list_plans(conversation_id)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc


@router.get("/api/conversations/{conversation_id}/plans/{plan_path:path}")
async def read_plan_route(request: Request, conversation_id: str, plan_path: str):
    try:
        return _conversations(request).read_plan(conversation_id, plan_path)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc


@router.post("/api/conversations/{conversation_id}/enter-ask")
async def enter_ask_route(request: Request, conversation_id: str):
    try:
        return await _conversations(request).enter_ask(conversation_id)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc


@router.post("/api/conversations/{conversation_id}/leave-ask")
async def leave_ask_route(request: Request, conversation_id: str):
    try:
        return await _conversations(request).leave_ask(conversation_id)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc


@router.post("/api/conversations/{conversation_id}/leave-plan")
async def leave_plan_route(request: Request, conversation_id: str):
    try:
        return await _conversations(request).leave_plan(conversation_id)
    except _DOMAIN as exc:
        raise conversation_http(exc) from exc
