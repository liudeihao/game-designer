"""Schema additions must reach databases created before the column existed."""

from __future__ import annotations

import sqlite3

import pytest

from app.store import db
from app.store._connection import init_db

LEGACY_CONVERSATIONS = """
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT '',
    plan_markdown TEXT NOT NULL DEFAULT '',
    folder_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""


@pytest.fixture
def legacy_db(tmp_path, monkeypatch):
    path = tmp_path / "registry.db"
    seed = sqlite3.connect(str(path))
    seed.execute(LEGACY_CONVERSATIONS)
    seed.execute(
        "INSERT INTO conversations VALUES "
        "('conv_old', 'proj_1', '旧对话', '', '# 旧计划', NULL, 'then', 'then')"
    )
    seed.commit()
    seed.close()

    monkeypatch.setattr(db, "_DB_PATH", path)
    monkeypatch.setattr(db, "_conn", None)
    yield path
    if db._conn is not None:
        db._conn.close()
        db._conn = None


def test_plan_title_is_added_to_a_pre_existing_conversations_table(legacy_db) -> None:
    init_db()
    conv = db.get_conversation("conv_old")
    assert conv is not None
    assert conv["plan_markdown"] == "# 旧计划"
    assert conv["plan_title"] == ""


def test_migration_is_idempotent(legacy_db) -> None:
    init_db()
    init_db()
    db.save_conversation_plan("conv_old", "# 新计划", "核心战斗循环")
    assert db.get_conversation("conv_old")["plan_title"] == "核心战斗循环"
