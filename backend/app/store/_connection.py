"""Shared SQLite connection, lock, and schema bootstrap for the project store."""

from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone

_lock = threading.Lock()


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    # Path and live connection live on ``db`` so tests can patch them there.
    from . import db

    if db._conn is None:
        db._DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        db._conn = sqlite3.connect(str(db._DB_PATH), check_same_thread=False)
        db._conn.row_factory = sqlite3.Row
    return db._conn


def locked():
    return _lock


def init_db() -> None:
    with _lock:
        conn = connect()
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                label TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                initial_plan_done INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                kind TEXT NOT NULL DEFAULT '',
                plan_markdown TEXT NOT NULL DEFAULT '',
                plan_title TEXT NOT NULL DEFAULT '',
                folder_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS conversation_folders (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS llm_usage (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                turn_id TEXT NOT NULL,
                model TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT '',
                input_tokens INTEGER NOT NULL DEFAULT 0,
                output_tokens INTEGER NOT NULL DEFAULT 0,
                cache_read_tokens INTEGER NOT NULL DEFAULT 0,
                cache_write_tokens INTEGER NOT NULL DEFAULT 0,
                usage_source TEXT NOT NULL DEFAULT 'provider',
                input_breakdown_json TEXT NOT NULL DEFAULT '{}',
                tags_json TEXT NOT NULL DEFAULT '[]',
                tools_offered_json TEXT NOT NULL DEFAULT '[]',
                tools_invoked_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_llm_usage_project ON llm_usage(project_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_llm_usage_conversation ON llm_usage(conversation_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_llm_usage_turn ON llm_usage(turn_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage(created_at)"
        )
        _add_missing_columns(
            conn,
            "conversations",
            {"plan_title": "TEXT NOT NULL DEFAULT ''"},
        )
        conn.commit()


def _add_missing_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    """Additive-only migration. CREATE TABLE IF NOT EXISTS never alters an existing table."""
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    for name, decl in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")
