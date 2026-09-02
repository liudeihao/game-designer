"""User Rule / Project Rule HTTP API."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.api.helpers import conversation_http
from app.api.schemas import RuleBody, RuleProposalBody
from app.conversations import ConversationService
from app.conversations.errors import (
    ConversationBadRequest,
    ConversationNotFound,
    ProjectNotFound,
)
from app.store import db
from app.rules import (
    parse_rules_for_save,
    read_project_rules,
    read_user_rules,
    rule_payload,
    write_project_rules,
    write_user_rules,
)

router = APIRouter()


def _conversations(request: Request) -> ConversationService:
    return request.app.state.conversations


def _items_from_body(body: RuleBody) -> list[dict[str, str]]:
    try:
        return parse_rules_for_save([item.model_dump() for item in body.rules])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/rules/user")
async def get_user_rule():
    return rule_payload(read_user_rules())


@router.put("/api/rules/user")
async def put_user_rule(body: RuleBody):
    write_user_rules(_items_from_body(body))
    return rule_payload(read_user_rules())


@router.get("/api/projects/{project_id}/rules")
async def get_project_rule(project_id: str):
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="project not found")
    return rule_payload(read_project_rules(project_id))


@router.put("/api/projects/{project_id}/rules")
async def put_project_rule(project_id: str, body: RuleBody):
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="project not found")
    write_project_rules(project_id, _items_from_body(body))
    return rule_payload(read_project_rules(project_id))


@router.post("/api/conversations/{conversation_id}/rule-proposals/{proposal_id}")
async def resolve_rule_proposal(
    request: Request,
    conversation_id: str,
    proposal_id: str,
    body: RuleProposalBody,
):
    try:
        return await _conversations(request).resolve_rule_proposal(
            conversation_id,
            proposal_id,
            action=body.action,
            scope=body.scope,
            operation=body.operation,
            name=body.name,
            details=body.details,
            text=body.text,
        )
    except (ConversationNotFound, ConversationBadRequest, ProjectNotFound) as exc:
        raise conversation_http(exc) from exc
