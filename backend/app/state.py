"""LangGraph agent state for the Markdown docs workbench."""

from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages


def last_value(current: Any, update: Any) -> Any:
    """Overwrite channel. ``None`` means leave the current value unchanged."""
    return current if update is None else update


def reduce_workspace_files(current: Any, update: Any) -> dict:
    """Reducer for Markdown workspace ``path → text`` maps."""
    if isinstance(current, dict):
        if "files" in current and isinstance(current.get("files"), dict) and "revs" in current:
            base = dict(current["files"])
        else:
            base = {
                str(k): ("" if v is None else str(v))
                for k, v in current.items()
                if k != "__replace__"
            }
    else:
        base = {}

    if not isinstance(update, dict):
        return base

    if "__replace__" in update:
        replacement = update.get("__replace__")
        if isinstance(replacement, dict):
            if "files" in replacement and isinstance(replacement.get("files"), dict):
                replacement = replacement["files"]
            return {
                str(k): ("" if v is None else str(v))
                for k, v in replacement.items()
                if v is not None and k != "__replace__"
            }
        return {}

    out = dict(base)
    for path, content in update.items():
        if path == "__replace__":
            continue
        key = str(path)
        if content is None:
            out.pop(key, None)
        else:
            out[key] = str(content)
    return out


class ActivityEntry(TypedDict, total=False):
    ts: str
    agent: str
    kind: str
    message: str
    detail: dict


class AgentState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], add_messages]
    project_id: str
    instruction: str
    mode: str  # "plan" | "ask" | "" (unset = Agent at rest)
    trigger: str  # e.g. "execute_plan"
    # Kept for existing checkpoints. Runtime no longer writes this channel;
    # docs live on disk and DocsSession reads them from there.
    workspace_files: Annotated[dict, reduce_workspace_files]
    activity: Annotated[list[ActivityEntry], operator.add]
    events: Annotated[list[dict[str, Any]], operator.add]
    plan_markdown: str
    plan_title: str
    plan_status: str
    conversation_summary: str
    summary_upto: int
    last_compaction: dict[str, Any]
    active_context_messages: list[Any]
    active_context_source_count: int
    active_context_source_fingerprint: str
    compaction_window: int
    compaction_checkpoint: dict[str, Any]
    pending_user_choice: dict[str, Any]
    # Full LLM request for the in-flight ReAct loop (system + history + extras).
    # Overwritten each Step; cleared in turn_finalize so checkpoints stay small.
    turn_request: Annotated[list[AnyMessage], last_value]
    # Per-turn scratch (loop counters, session snapshot, permission answers).
    turn_scratch: Annotated[dict[str, Any], last_value]
    # Turn-local workspace bookkeeping. Disk holds file text; these are traces.
    # agent_tools merges parallel Command patches before writing these channels.
    read_paths: Annotated[list[str], last_value]
    listed_dirs: Annotated[list[str], last_value]
    workspace_writes: Annotated[list, last_value]
    workspace_revs: Annotated[dict[str, int], last_value]
