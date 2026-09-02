"""Mode / plan lifecycle and rule-proposal resolution."""

from __future__ import annotations

from typing import Any

from app.agent.plan.execute import execute_plan_instruction
from app.agent.plan.node import compact_plan_state
from app.agent.plan.status import PLAN_DRAFTING, PLAN_EXECUTED, PLAN_READY, plan_to_resume
from app.agent.tools.deps import ASK, NORMAL, PLAN
from app.config import get_config
from app.conversations.events import rule_proposal_event
from app.docs import list_plan_snapshots, write_plan_snapshot
from app.store import db
from app.rules import (
    OPS,
    SCOPES,
    apply_rule_op,
    normalize_proposal_args,
    read_project_rules,
    read_user_rules,
    rule_payload,
    write_project_rules,
    write_user_rules,
)
from app.usage import UsageCallbackHandler, bind_usage_turn, new_turn_id

from .errors import (
    ConversationBadRequest,
    ConversationConflict,
    ConversationNotFound,
    conv_mode,
    require_conversation,
)
from ._runs import ConversationRun


class LifecycleOps:
    async def _set_mode(self, conversation_id: str, mode: str, **runtime_values: Any) -> dict[str, Any]:
        values = {"mode": mode, **runtime_values}
        try:
            await self.update_runtime(conversation_id, values)
        except Exception:
            pass
        return db.set_conversation_mode(conversation_id, mode)

    async def enter_plan(self, conversation_id: str) -> dict[str, Any]:
        conv = require_conversation(conversation_id)
        snapshot = await self.load_runtime(conversation_id)
        plan_md, plan_name = plan_to_resume(
            snapshot.plan_markdown or conv.get("plan_markdown") or "",
            snapshot.plan_title or conv.get("plan_title") or "",
            snapshot.plan_status,
        )
        fresh = not bool(plan_md)
        await self._set_mode(
            conversation_id,
            "plan",
            plan_markdown=plan_md,
            plan_title=plan_name,
            plan_status=PLAN_DRAFTING if fresh else PLAN_READY,
        )
        db.save_conversation_plan(conversation_id, plan_md, plan_name)
        updated = db.get_conversation(conversation_id) or conv
        return {
            "conversation": updated,
            "plan_markdown": plan_md,
            "plan_title": plan_name,
            "plan_archives": list_plan_snapshots(conv["project_id"], conversation_id),
            "fresh": fresh,
        }

    async def leave_plan(self, conversation_id: str) -> dict[str, Any]:
        conv = require_conversation(conversation_id)
        if conv_mode(conv) != PLAN:
            return {"conversation": conv}
        updated = await self._set_mode(conversation_id, NORMAL)
        return {"conversation": updated}

    async def enter_ask(self, conversation_id: str) -> dict[str, Any]:
        require_conversation(conversation_id)
        updated = await self._set_mode(conversation_id, "ask")
        return {"conversation": updated}

    async def leave_ask(self, conversation_id: str) -> dict[str, Any]:
        conv = require_conversation(conversation_id)
        if conv_mode(conv) != ASK:
            return {"conversation": conv}
        updated = await self._set_mode(conversation_id, NORMAL)
        return {"conversation": updated}

    async def execute_plan(self, conversation_id: str) -> ConversationRun:
        conv = require_conversation(conversation_id)
        snapshot = await self.load_runtime(conversation_id)
        plan_md = (snapshot.plan_markdown or conv.get("plan_markdown") or "").strip()
        if not plan_md:
            raise ConversationBadRequest("plan is empty; generate a plan first")
        plan_name = (snapshot.plan_title or conv.get("plan_title") or "").strip()
        project_id = conv["project_id"]
        snap_path = write_plan_snapshot(project_id, conversation_id, plan_md, plan_name)
        db.set_conversation_mode(conversation_id, NORMAL)
        db.mark_initial_plan_done(project_id)
        try:
            await self.update_runtime(
                conversation_id,
                {"mode": NORMAL, "plan_status": PLAN_EXECUTED},
            )
        except Exception:
            pass
        instruction = execute_plan_instruction(snap_path, plan_md)
        return ConversationRun(
            program={
                "project_id": project_id,
                "mode": NORMAL,
                "trigger": "execute_plan",
                "instruction": instruction,
                "messages": [],
            },
            project_id=project_id,
            conversation_id=conversation_id,
            mode=NORMAL,
            start_activity="按计划写入文档",
        )

    async def compact(self, conversation_id: str) -> dict[str, Any]:
        conv = require_conversation(conversation_id)
        if conv_mode(conv) != "plan":
            raise ConversationConflict("manual compact currently requires Plan mode")
        snapshot = await self.load_runtime(conversation_id)
        if not snapshot.messages:
            raise ConversationConflict("conversation has no messages to compact")
        endpoint = get_config().llm.resolve(utility=True) or get_config().llm.resolve(
            utility=False
        )
        usage = UsageCallbackHandler(
            project_id=conv["project_id"],
            conversation_id=conversation_id,
            turn_id=new_turn_id(),
            default_model=(endpoint.model if endpoint else get_config().llm.model) or "unknown",
            mode="plan",
        )
        with bind_usage_turn(usage):
            update = await compact_plan_state(snapshot.agent_state, trigger="manual")
        await self.update_runtime(conversation_id, update)
        return {
            "conversation_id": conversation_id,
            "compaction": update.get("last_compaction") or {},
            "checkpoint": update.get("compaction_checkpoint") or {},
        }

    async def resolve_rule_proposal(
        self,
        conversation_id: str,
        proposal_id: str,
        *,
        action: str,
        scope: str | None = None,
        operation: str | None = None,
        name: str | None = None,
        details: Any = None,
        text: str | None = None,
    ) -> dict[str, Any]:
        conv = require_conversation(conversation_id)
        action = (action or "").strip().lower()
        if action not in {"accept", "ignore"}:
            raise ConversationBadRequest("action must be accept or ignore")
        try:
            snapshot = await self.load_runtime(conversation_id)
        except Exception as exc:
            raise ConversationNotFound(conversation_id) from exc
        existing = next(
            (
                item
                for item in snapshot.events
                if item.get("type") == "rule_proposal" and item.get("id") == proposal_id
            ),
            None,
        )
        if not existing:
            raise ConversationNotFound(conversation_id, detail="rule proposal not found")
        if existing.get("status") in {"accepted", "ignored"}:
            return {"ok": True, "event": existing, "rule": None}

        existing_details = existing.get("details")
        if existing_details is None:
            existing_details = existing.get("text") or ""
        merged: dict[str, Any] = {
            "scope": scope if scope is not None else existing.get("scope"),
            "operation": operation if operation is not None else existing.get("operation"),
            "name": name if name is not None else existing.get("name") or "",
            "details": existing_details,
        }
        if details is not None:
            merged["details"] = details
        elif text is not None:
            merged["details"] = text
        payload = normalize_proposal_args(merged)
        if payload["scope"] not in SCOPES or payload["operation"] not in OPS:
            raise ConversationBadRequest("invalid scope or operation")

        status = "ignored"
        rule_out: dict[str, Any] | None = None
        if action == "accept":
            try:
                project_id = str(conv.get("project_id") or "")
                if payload["scope"] == "user":
                    next_items = apply_rule_op(
                        read_user_rules(),
                        payload["operation"],
                        payload["name"],
                        payload["details"],
                    )
                    write_user_rules(next_items)
                    rule_out = rule_payload(next_items)
                else:
                    if not project_id:
                        raise ConversationBadRequest("project_id required")
                    next_items = apply_rule_op(
                        read_project_rules(project_id),
                        payload["operation"],
                        payload["name"],
                        payload["details"],
                    )
                    write_project_rules(project_id, next_items)
                    rule_out = rule_payload(next_items)
            except ValueError as exc:
                raise ConversationBadRequest(str(exc)) from exc
            status = "accepted"

        event = rule_proposal_event(
            proposal_id=proposal_id,
            scope=payload["scope"],
            operation=payload["operation"],
            name=payload["name"],
            details=payload["details"],
            status=status,  # type: ignore[arg-type]
            after_human=existing.get("after_human"),
        )
        await self.update_runtime(conversation_id, {"events": [event]})
        return {"ok": True, "event": event, "rule": rule_out}
