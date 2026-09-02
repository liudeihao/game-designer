"""Read models: conversation detail, context usage, plan snapshots."""

from __future__ import annotations

from typing import Any

from app.agent.plan.progress import plan_progress_from_markdown
from app.agent.plan.status import PLAN_DRAFTING, PLAN_READY
from app.config import get_config
from app.docs import (
    list_plan_snapshots,
    load_project_workspace,
    plan_title_from_markdown,
    read_plan_snapshot,
)
from app.memory.context_usage import resolve_context_usage
from app.store import db

from .errors import PlanNotFound, conv_mode, require_conversation


class DetailOps:
    async def get_detail(self, conversation_id: str) -> dict[str, Any]:
        conv = require_conversation(conversation_id)
        snapshot = await self.load_runtime(conversation_id)
        plan_md = snapshot.plan_markdown or conv.get("plan_markdown") or ""
        status = snapshot.plan_status if plan_md.strip() else PLAN_DRAFTING
        if plan_md.strip() and status == PLAN_DRAFTING:
            status = PLAN_READY
        workspace = load_project_workspace(conv["project_id"])
        return {
            "conversation": conv,
            "workspace": workspace,
            "activity": snapshot.activity,
            "events": snapshot.events,
            "messages": snapshot.ui_messages(),
            "pending": snapshot.pending,
            "plan_markdown": plan_md,
            "plan_title": snapshot.plan_title or conv.get("plan_title") or "",
            "plan_status": status,
            "plan_archives": list_plan_snapshots(conv["project_id"], conversation_id),
            "plan_progress": plan_progress_from_markdown(plan_md),
            "usage": db.usage_scopes(
                project_id=conv["project_id"],
                conversation_id=conversation_id,
            ),
        }

    async def context_usage(
        self,
        conversation_id: str,
        model: str = "",
        provider_id: str = "",
    ) -> dict[str, Any]:
        conv = require_conversation(conversation_id)
        snapshot = await self.load_runtime(conversation_id)
        cfg = get_config()
        endpoint = cfg.llm.resolve(utility=False)
        model_name = (model or "").strip()
        pid = (provider_id or "").strip()
        if "::" in model_name and not pid:
            pid, model_name = model_name.split("::", 1)
        if not model_name:
            model_name = endpoint.model if endpoint else ""
        if not pid:
            pid = endpoint.provider_id if endpoint else ""
        return await resolve_context_usage(
            conversation_id=conversation_id,
            messages=snapshot.messages,
            workspace_value=load_project_workspace(conv["project_id"]),
            mode=conv_mode(conv),
            conversation_summary=snapshot.conversation_summary,
            model=model_name,
            provider_id=pid,
            project_id=str(conv.get("project_id") or ""),
        )

    def list_plans(self, conversation_id: str) -> dict[str, Any]:
        conv = require_conversation(conversation_id)
        return {"plans": list_plan_snapshots(conv["project_id"], conversation_id)}

    def read_plan(self, conversation_id: str, plan_path: str) -> dict[str, Any]:
        conv = require_conversation(conversation_id)
        try:
            markdown = read_plan_snapshot(conv["project_id"], plan_path)
        except (ValueError, FileNotFoundError) as exc:
            raise PlanNotFound(plan_path) from exc
        return {
            "path": plan_path,
            "title": plan_title_from_markdown(markdown),
            "markdown": markdown,
        }
