"""Project catalog stored in SQLite (separate from the LangGraph checkpointer).

Tracks projects and conversations. Design docs live under
``DATA_DIR/projects/{id}/docs/`` with OCC revs in ``.studio/meta.json``.
Per-conversation chat state lives in the LangGraph checkpointer, keyed by
thread_id == conversation_id. Deleting a conversation row from the store does
not touch checkpoints; ConversationService does.

Implementation is split by table; this module is the public import surface.
"""

from __future__ import annotations

import sqlite3

from ..config import DATA_DIR
from ._connection import init_db
from ._conversations import (
    create_conversation,
    create_folder,
    delete_conversation,
    delete_folder,
    get_conversation,
    get_folder,
    is_placeholder_title,
    list_conversations,
    list_folders,
    rename_conversation,
    rename_folder,
    save_conversation_plan,
    set_conversation_folder,
    set_conversation_mode,
    touch_conversation,
)
from ._projects import (
    create_project,
    delete_project,
    ensure_initial_plan_done_flag,
    get_project,
    list_projects,
    mark_initial_plan_done,
    rename_project,
    touch_project,
    update_project,
)
from ._usage import (
    insert_usage,
    latest_llm_usage,
    summarize_usage,
    usage_analytics,
    usage_scopes,
)

_DB_PATH = DATA_DIR / "registry.sqlite"
_conn: sqlite3.Connection | None = None

__all__ = [
    "create_conversation",
    "create_folder",
    "create_project",
    "delete_conversation",
    "delete_folder",
    "delete_project",
    "ensure_initial_plan_done_flag",
    "get_conversation",
    "get_folder",
    "get_project",
    "init_db",
    "insert_usage",
    "is_placeholder_title",
    "latest_llm_usage",
    "list_conversations",
    "list_folders",
    "list_projects",
    "mark_initial_plan_done",
    "rename_conversation",
    "rename_folder",
    "rename_project",
    "save_conversation_plan",
    "set_conversation_folder",
    "set_conversation_mode",
    "summarize_usage",
    "touch_conversation",
    "touch_project",
    "update_project",
    "usage_analytics",
    "usage_scopes",
]
