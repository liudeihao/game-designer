"""LangGraph checkpoint adapter for one Conversation thread.

Routes and services talk to this module, not to ``snapshot.values`` / ``snapshot.tasks``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, AsyncIterator, Optional

from app.agent.plan.status import PLAN_DRAFTING
from app.agent.context import AgentContext, context_from_state


def thread_config(conversation_id: str) -> dict:
    """One conversation = one checkpoint thread (Plan is a mode, not a thread)."""
    return {"configurable": {"thread_id": conversation_id}}


def _agent_state(snapshot: Any) -> dict[str, Any]:
    values = getattr(snapshot, "values", None) or {}
    return dict(values) if isinstance(values, dict) else {}


def _pending_from_snapshot(snapshot: Any) -> Optional[dict]:
    tasks = getattr(snapshot, "tasks", None) or []
    for task in tasks:
        interrupts = getattr(task, "interrupts", None) or []
        for intr in interrupts:
            val = getattr(intr, "value", None)
            if val is not None:
                return val
    return None


def workspace_from_state(values: dict[str, Any] | None) -> dict[str, str]:
    """Docs map for this conversation. Disk is the authority when project_id is set."""
    project_id = str((values or {}).get("project_id") or "")
    if project_id:
        from app.docs import load_workspace

        return load_workspace(project_id)
    files = (values or {}).get("workspace_files")
    if isinstance(files, dict):
        if "files" in files and isinstance(files.get("files"), dict) and "revs" in files:
            files = files["files"]
        return {str(k): ("" if v is None else str(v)) for k, v in files.items() if k != "__replace__"}
    # Transitional: older checkpoints may still carry ``gdd`` as a files map.
    legacy = (values or {}).get("gdd")
    if isinstance(legacy, dict) and all(isinstance(v, str) for v in legacy.values() if v is not None):
        return {str(k): str(v) for k, v in legacy.items() if isinstance(v, str)}
    return {}


def is_message_visible_in_ui(message: Any) -> bool:
    """Hide tool transcripts; keep human + user-facing assistant bubbles."""
    role = getattr(message, "type", "ai")
    if role == "tool":
        return False
    if role != "ai":
        return True
    content = getattr(message, "content", "")
    if not isinstance(content, str):
        content = str(content) if content else ""
    extra = getattr(message, "additional_kwargs", None) or {}
    parts = extra.get("parts")
    tool_calls = getattr(message, "tool_calls", None) or []
    if tool_calls and not content.strip() and not parts and not extra.get("reasoning"):
        return False
    return True


def serialize_messages(messages: list) -> list[dict]:
    """Project stored messages into the chat-timeline payload."""
    out: list[dict] = []
    for i, message in enumerate(messages or []):
        if not is_message_visible_in_ui(message):
            continue
        role = getattr(message, "type", "ai")
        content = getattr(message, "content", "")
        if not isinstance(content, str):
            content = str(content)
        extra = getattr(message, "additional_kwargs", None) or {}
        parts = extra.get("parts")
        msg_id = extra.get("id") or f"msg-{i}"
        entry: dict[str, Any] = {"id": msg_id, "role": role, "content": content}
        reasoning = extra.get("reasoning")
        if isinstance(reasoning, str) and reasoning.strip():
            entry["reasoning"] = reasoning.strip()
        if parts:
            entry["parts"] = parts
        kind = extra.get("kind")
        if kind:
            entry["kind"] = kind
        answers = extra.get("answers")
        if answers:
            entry["answers"] = answers
        plan_questions = extra.get("plan_questions")
        if plan_questions:
            entry["plan_questions"] = plan_questions
        if extra.get("interrupted"):
            entry["interrupted"] = True
        if not kind and role == "human" and content.strip().startswith("【用户回答】"):
            entry["kind"] = "answers"
        if not kind and role == "human" and content.strip().startswith("【内容确认】"):
            entry["kind"] = "user_choice"
        out.append(entry)
    return out


def _is_absent_checkpoint_store(exc: BaseException) -> bool:
    message = str(exc).lower()
    return "no such table" in message or "does not exist" in message


@dataclass(frozen=True)
class ConversationSnapshot:
    """Business view of one conversation's recoverable runtime."""

    conversation_id: str
    agent_state: dict[str, Any]
    pending: Optional[dict]

    @property
    def messages(self) -> list:
        return list(self.agent_state.get("messages") or [])

    @property
    def activity(self) -> list[dict]:
        return list(self.agent_state.get("activity") or [])

    @property
    def events(self) -> list[dict]:
        return list(self.agent_state.get("events") or [])

    @property
    def plan_markdown(self) -> str:
        return str(self.agent_state.get("plan_markdown") or "")

    @property
    def plan_title(self) -> str:
        return str(self.agent_state.get("plan_title") or "")

    @property
    def plan_status(self) -> str:
        return str(self.agent_state.get("plan_status") or PLAN_DRAFTING)

    @property
    def conversation_summary(self) -> str:
        return str(self.agent_state.get("conversation_summary") or "")

    @property
    def workspace_files(self) -> dict[str, str]:
        return workspace_from_state(self.agent_state)

    def ui_messages(self) -> list[dict]:
        """Visible Message bubbles. Cards come from ``events``, not parts."""
        return serialize_messages(self.messages)


class ConversationRuntime:
    """Load, update, stream, and delete the LangGraph thread for a Conversation."""

    def __init__(self, graph: Any):
        self._graph = graph

    def thread_config(self, conversation_id: str) -> dict:
        return thread_config(conversation_id)

    async def load(self, conversation_id: str) -> ConversationSnapshot:
        snapshot = await self._graph.aget_state(thread_config(conversation_id))
        return ConversationSnapshot(
            conversation_id=conversation_id,
            agent_state=_agent_state(snapshot),
            pending=_pending_from_snapshot(snapshot),
        )

    async def get_messages(self, conversation_id: str) -> list:
        return (await self.load(conversation_id)).messages

    async def get_pending(self, conversation_id: str) -> Optional[dict]:
        return (await self.load(conversation_id)).pending

    async def update(self, conversation_id: str, values: dict[str, Any]) -> None:
        await self._graph.aupdate_state(thread_config(conversation_id), values)

    async def astream(
        self,
        program: Any,
        config: dict[str, Any],
        **kwargs: Any,
    ) -> AsyncIterator[Any]:
        context = kwargs.pop("context", None)
        if context is None:
            if isinstance(program, dict):
                context = context_from_state(program)
            else:
                thread_id = (config.get("configurable") or {}).get("thread_id")
                if thread_id:
                    snap = await self.load(str(thread_id))
                    context = context_from_state(snap.agent_state)
                else:
                    context = AgentContext()
        async for item in self._graph.astream(program, config, context=context, **kwargs):
            yield item

    async def delete(self, conversation_id: str) -> None:
        """Remove every checkpoint row for this conversation thread.

        Missing tables or a never-run thread are treated as already gone.
        """
        checkpointer = getattr(self._graph, "checkpointer", None)
        if checkpointer is None:
            return
        setup = getattr(checkpointer, "setup", None)
        if callable(setup):
            try:
                await setup()
            except TypeError:
                setup()
            except Exception as exc:
                if not _is_absent_checkpoint_store(exc):
                    raise
        adelete = getattr(checkpointer, "adelete_thread", None)
        try:
            if callable(adelete):
                await adelete(conversation_id)
                return
            delete = getattr(checkpointer, "delete_thread", None)
            if callable(delete):
                delete(conversation_id)
        except Exception as exc:
            if _is_absent_checkpoint_store(exc):
                return
            raise
