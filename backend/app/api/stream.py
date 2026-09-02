"""SSE streaming for agent graph runs."""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, AsyncIterator

from app.agent.cancel import RunCancel
from app.agent.context import context_from_state
from app.config import get_config
from app.conversations.runtime import ConversationRuntime
from app.conversations._runs import complete_turn, stored_usage
from app.memory.context_usage import context_usage_from_call
from app.usage import UsageCallbackHandler, new_turn_id
from app.agent.plan.progress import plan_progress_from_markdown


def dispatch_custom(chunk: dict) -> tuple[str, dict]:
    """Map a custom-stream payload to (sse_event_name, data)."""
    kind = chunk.get("type", "activity")
    if kind == "reasoning":
        return "reasoning", {"text": chunk.get("text", ""), "node": chunk.get("node", "")}
    if kind == "token":
        return "token", {"text": chunk.get("text", ""), "node": chunk.get("node", "")}
    if kind == "trace_start":
        payload: dict[str, Any] = {
            "id": chunk.get("id", ""),
            "agent": chunk.get("agent", ""),
            "name": chunk.get("name", ""),
            "args": chunk.get("args") or {},
        }
        if chunk.get("kind") is not None:
            payload["kind"] = chunk["kind"]
        return "trace_start", payload
    if kind == "trace_end":
        payload: dict[str, Any] = {
            "id": chunk.get("id", ""),
            "agent": chunk.get("agent", ""),
            "status": chunk.get("status", "success"),
        }
        if chunk.get("result") is not None:
            payload["result"] = chunk["result"]
        if chunk.get("error") is not None:
            payload["error"] = chunk["error"]
        return "trace_end", payload
    if kind == "plan":
        markdown = chunk.get("markdown", "")
        return "plan", {
            "markdown": markdown,
            "title": chunk.get("title", ""),
            "progress": plan_progress_from_markdown(markdown),
        }
    return "activity", chunk


def wrap_frame(
    event: str,
    data: Any,
    *,
    turn_id: str,
    frame_id: str | None = None,
    ts: int | None = None,
) -> dict[str, Any]:
    """Live SSE envelope. ``data`` is the original event payload."""
    return {
        "id": frame_id or f"frm_{uuid.uuid4().hex[:16]}",
        "turn_id": turn_id,
        "type": event,
        "ts": int(time.time() * 1000) if ts is None else ts,
        "data": data,
    }


def sse(
    event: str,
    data: Any,
    *,
    turn_id: str = "",
    frame_id: str | None = None,
    ts: int | None = None,
) -> str:
    frame = wrap_frame(event, data, turn_id=turn_id, frame_id=frame_id, ts=ts)
    return f"event: {event}\ndata: {json.dumps(frame, ensure_ascii=False)}\n\n"


async def persist_live_ui(runtime: ConversationRuntime, conversation_id: str, snapshot):
    """No-op: the column is assembled from Message + Event, not written-back parts."""
    del runtime, conversation_id
    return snapshot


def _error_message(exc: BaseException) -> str:
    message = str(exc).strip() or type(exc).__name__
    cause = exc.__cause__ or exc.__context__
    if cause is None or cause is exc:
        return message
    extra = str(cause).strip()
    label = type(cause).__name__
    return f"{message} ({label}: {extra})" if extra else f"{message} ({label})"


async def stream_conversation(
    service: Any,
    program,
    project_id: str,
    conversation_id: str,
    **kwargs: Any,
) -> AsyncIterator[str]:
    """Register a cancel token for this conversation, then stream the graph run."""
    cancel = service.runs.begin(conversation_id)
    try:
        async for item in stream_run(
            service.runtime,
            program,
            project_id,
            conversation_id,
            cancel=cancel,
            **kwargs,
        ):
            yield item
    finally:
        service.runs.end(conversation_id, cancel)


async def stream_run(
    runtime: ConversationRuntime,
    program,
    project_id: str,
    conversation_id: str,
    *,
    mode: str = "",
    start_activity: str | None = None,
    cancel: RunCancel | None = None,
) -> AsyncIterator[str]:
    """Run the graph and translate LangGraph stream chunks into SSE events."""
    turn_id = new_turn_id()
    endpoint = get_config().llm.resolve(utility=False)
    usage = UsageCallbackHandler(
        project_id=project_id,
        conversation_id=conversation_id,
        turn_id=turn_id,
        default_model=(endpoint.model if endpoint else get_config().llm.model) or "unknown",
        mode=mode,
    )
    usage.start_turn()
    try:
        run_config = runtime.thread_config(conversation_id)
        existing_cbs = list(run_config.get("callbacks") or [])
        run_config["callbacks"] = existing_cbs + [usage]
        meta = dict(run_config.get("metadata") or {})
        meta.update(
            {
                "project_id": project_id,
                "conversation_id": conversation_id,
                "turn_id": turn_id,
            }
        )
        run_config["metadata"] = meta
        if cancel is not None:
            configurable = dict(run_config.get("configurable") or {})
            configurable["run_cancel"] = cancel
            run_config["configurable"] = configurable

        def emit(event: str, data: Any) -> str:
            return sse(event, data, turn_id=turn_id)

        yield emit(
            "activity",
            {
                "type": "activity",
                "ts": "",
                "agent": "系统",
                "kind": "work",
                "message": start_activity
                or "已收到指令，Agent 开始工作（真实模型首次响应可能需要 15–30 秒）…",
                "detail": {},
            },
        )
        last_usage_calls = 0

        def _usage_scopes() -> dict[str, Any]:
            scopes = stored_usage(
                project_id=project_id,
                conversation_id=conversation_id,
                turn_id=turn_id,
            )
            call = usage.latest_context_call()
            if call:
                endpoint = get_config().llm.resolve(utility=False)
                context = context_usage_from_call(
                    call,
                    mode=mode,
                    model=call.get("model"),
                    provider_id=endpoint.provider_id if endpoint else "",
                )
                if context:
                    scopes["context"] = context
            return scopes

        def _usage_event() -> str | None:
            nonlocal last_usage_calls
            if usage.turn_calls <= last_usage_calls:
                return None
            last_usage_calls = usage.turn_calls
            scopes = _usage_scopes()
            scopes["turn"] = usage.turn_summary()
            return emit("usage", scopes)

        try:
            async for stream_mode, chunk in runtime.astream(
                program,
                run_config,
                stream_mode=["updates", "custom"],
                context=context_from_state(
                    {
                        **(program if isinstance(program, dict) else {}),
                        "project_id": project_id,
                        "mode": mode,
                    }
                ),
            ):
                if stream_mode == "custom" and isinstance(chunk, dict):
                    event_name, data = dispatch_custom(chunk)
                    yield emit(event_name, data)
                elif stream_mode == "updates" and isinstance(chunk, dict):
                    if "__interrupt__" in chunk:
                        intr = chunk["__interrupt__"]
                        val = getattr(intr[0], "value", None) if intr else None
                        yield emit("pending", val or {})
                    for node_name in ("agent_tools", "turn_finalize", "user_choice"):
                        if node_name in chunk:
                            node_update = chunk.get(node_name) or {}
                            plan_md_chunk = node_update.get("plan_markdown")
                            if plan_md_chunk:
                                yield emit(
                                    "plan",
                                    {
                                        "markdown": plan_md_chunk,
                                        "title": node_update.get("plan_title") or "",
                                        "progress": plan_progress_from_markdown(plan_md_chunk),
                                    },
                                )
                usage_sse = _usage_event()
                if usage_sse:
                    yield usage_sse
        except Exception as exc:
            yield emit("error", {"message": _error_message(exc)})
        usage_sse = _usage_event()
        if usage_sse:
            yield usage_sse

        usage_scopes = _usage_scopes()
        turn_summary = usage.turn_summary()
        if turn_summary["calls"] > 0:
            usage_scopes["turn"] = turn_summary

        interrupted = bool(cancel is not None and cancel.requested)
        if interrupted:
            yield emit(
                "activity",
                {
                    "type": "activity",
                    "ts": "",
                    "agent": "系统",
                    "kind": "work",
                    "message": "已按用户请求中断本轮",
                    "detail": {},
                },
            )

        done_payload = await complete_turn(
            runtime,
            conversation_id,
            project_id,
            mode=mode,
            usage_scopes=usage_scopes,
            interrupted=interrupted,
        )
        yield emit("done", done_payload)
    finally:
        usage.end_turn()
