"""Run control: chat / resume / stop, and the SSE done-payload projection."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from langchain_core.messages import HumanMessage
from langgraph.types import Command

from app.agent.plan.progress import plan_progress_from_markdown
from app.agent.plan.status import PLAN_DRAFTING
from app.agent.tools.deps import ASK, NORMAL, PLAN, normalize_mode
from app.config import get_config, update_llm_config
from app.conversations.snapshot import (
    activity,
    events,
    messages_with_pending_ask,
    pending,
    plan_markdown,
    plan_status,
    plan_title,
)
from app.docs import load_project_workspace
from app.store import db

from .errors import ConversationBadRequest, conv_mode, require_conversation


@dataclass
class ConversationRun:
    program: Any
    project_id: str
    conversation_id: str
    mode: str
    start_activity: str | None = None


def stored_usage(
    *,
    project_id: str,
    conversation_id: str,
    turn_id: str = "",
) -> dict[str, Any]:
    return db.usage_scopes(
        project_id=project_id,
        conversation_id=conversation_id,
        turn_id=turn_id,
    )


async def complete_turn(
    runtime: Any,
    conversation_id: str,
    project_id: str,
    *,
    mode: str,
    usage_scopes: dict[str, Any],
    interrupted: bool,
) -> dict[str, Any]:
    """Persist run side effects and build the SSE ``done`` payload."""
    snapshot = await runtime.load(conversation_id)
    hitl_pending = pending(snapshot)
    workspace = load_project_workspace(project_id)
    try:
        db.touch_project(project_id)
        db.touch_conversation(conversation_id)
    except Exception:
        pass

    plan_md = plan_markdown(snapshot)
    plan_name = plan_title(snapshot)
    if not plan_md.strip():
        stored = db.get_conversation(conversation_id) or {}
        plan_md = stored.get("plan_markdown") or ""
        plan_name = plan_name or stored.get("plan_title") or ""
    if plan_md.strip():
        try:
            db.save_conversation_plan(conversation_id, plan_md, plan_name)
        except Exception:
            pass

    exposed = PLAN if mode == PLAN else (ASK if mode == ASK else None)
    return {
        "kind": exposed,
        "mode": exposed,
        "workspace": workspace,
        "activity": activity(snapshot),
        "events": events(snapshot),
        "messages": messages_with_pending_ask(snapshot),
        "pending": hitl_pending,
        "plan_markdown": plan_md,
        "plan_title": plan_name,
        "plan_status": plan_status(snapshot) if plan_md.strip() else PLAN_DRAFTING,
        "plan_progress": plan_progress_from_markdown(plan_md),
        "usage": usage_scopes,
        "conversation": db.get_conversation(conversation_id),
        "interrupted": interrupted,
    }


class RunOps:
    def stop(self, conversation_id: str) -> bool:
        require_conversation(conversation_id)
        return self.runs.request_stop(conversation_id)

    async def start_chat(
        self,
        conversation_id: str,
        instruction: str,
        model: str | None = None,
    ) -> ConversationRun:
        conv = require_conversation(conversation_id)
        project_id = conv["project_id"]
        mode = conv_mode(conv)

        if model:
            try:
                cfg = get_config()
                model_id = model
                provider_id = cfg.llm.active_provider_id
                if "::" in model_id:
                    provider_id, model_id = model_id.split("::", 1)
                update_llm_config(active_provider_id=provider_id, model=model_id)
            except Exception:
                pass

        user_text = (instruction or "").strip()
        default_title = "新对话"
        if db.is_placeholder_title(conv.get("title")):
            title = user_text.splitlines()[0][:20] if user_text else default_title
            db.rename_conversation(conversation_id, title or default_title)
            conv = db.get_conversation(conversation_id) or conv

        stored_plan = (conv.get("plan_markdown") or "").strip()
        stored_plan_title = (conv.get("plan_title") or "").strip()

        if mode == "plan":
            program: dict[str, Any] = {
                "project_id": project_id,
                "mode": "plan",
                "instruction": user_text,
                "messages": [HumanMessage(content=user_text)],
                "plan_markdown": stored_plan,
                "plan_title": stored_plan_title,
                "trigger": "",
                "pending_user_choice": {},
            }
        else:
            run_mode = ASK if mode == ASK else NORMAL
            program = {
                "project_id": project_id,
                "mode": run_mode,
                "instruction": user_text,
                "messages": [HumanMessage(content=user_text)] if user_text else [],
                "plan_markdown": stored_plan,
                "plan_title": stored_plan_title,
                "trigger": "",
                "pending_user_choice": {},
            }
        return ConversationRun(
            program=program,
            project_id=project_id,
            conversation_id=conversation_id,
            mode=mode,
        )

    async def resume(
        self,
        conversation_id: str,
        decisions: dict[str, Any] | None,
    ) -> ConversationRun:
        conv = require_conversation(conversation_id)
        project_id = conv["project_id"]
        mode = conv_mode(conv)
        resolved = dict(decisions or {})
        snapshot = await self.runtime.load(conversation_id)
        pend = snapshot.pending or {}
        if not resolved:
            ptype = pend.get("type")
            is_questions = ptype == "user_choice" and (
                pend.get("questions") or pend.get("variant") == "questions"
            )
            if is_questions:
                raise ConversationBadRequest(
                    "answers required for pending questions (or action=skip)"
                )
            if pend.get("variant") == "suggest_mode":
                resolved = {"action": "dismiss"}
            elif ptype == "tool_permission":
                resolved = {
                    str(item.get("id") or ""): {"action": "reject"}
                    for item in (pend.get("calls") or [])
                    if isinstance(item, dict) and item.get("id")
                }
        if not resolved:
            resolved = {"__noop__": "approve"}

        if str(resolved.get("action") or "") == "switch":
            dest = normalize_mode(str(pend.get("mode") or ""))
            db.set_conversation_mode(conversation_id, dest)
            mode = dest

        return ConversationRun(
            program=Command(resume=resolved),
            project_id=project_id,
            conversation_id=conversation_id,
            mode=mode,
        )

    async def complete_turn(
        self,
        conversation_id: str,
        project_id: str,
        *,
        mode: str,
        usage_scopes: dict[str, Any],
        interrupted: bool,
    ) -> dict[str, Any]:
        return await complete_turn(
            self.runtime,
            conversation_id,
            project_id,
            mode=mode,
            usage_scopes=usage_scopes,
            interrupted=interrupted,
        )
