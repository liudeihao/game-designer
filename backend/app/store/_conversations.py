"""Conversation and folder rows in the SQLite store."""

from __future__ import annotations

import uuid

from app.agent.tools.deps import ASK, NORMAL, PLAN, normalize_mode

from ._connection import connect, locked, now

PLACEHOLDER_TITLES = frozenset({"", "新对话"})


def is_placeholder_title(title: str | None) -> bool:
    return (title or "").strip() in PLACEHOLDER_TITLES


def list_folders(pid: str) -> list[dict]:
    with locked():
        conn = connect()
        rows = conn.execute(
            "SELECT id, project_id, name, created_at, updated_at "
            "FROM conversation_folders WHERE project_id = ? ORDER BY name COLLATE NOCASE",
            (pid,),
        ).fetchall()
        return [dict(r) for r in rows]


def create_folder(pid: str, name: str) -> dict:
    fid = f"folder_{uuid.uuid4().hex[:10]}"
    ts = now()
    name = (name or "").strip() or "未命名文件夹"
    with locked():
        conn = connect()
        conn.execute(
            "INSERT INTO conversation_folders (id, project_id, name, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (fid, pid, name, ts, ts),
        )
        conn.commit()
    return {
        "id": fid,
        "project_id": pid,
        "name": name,
        "created_at": ts,
        "updated_at": ts,
    }


def rename_folder(fid: str, name: str) -> dict | None:
    name = (name or "").strip() or "未命名文件夹"
    with locked():
        conn = connect()
        conn.execute(
            "UPDATE conversation_folders SET name = ?, updated_at = ? WHERE id = ?",
            (name, now(), fid),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id, project_id, name, created_at, updated_at "
            "FROM conversation_folders WHERE id = ?",
            (fid,),
        ).fetchone()
        return dict(row) if row else None


def delete_folder(fid: str) -> None:
    """Delete folder; conversations inside become unfiled."""
    with locked():
        conn = connect()
        conn.execute(
            "UPDATE conversations SET folder_id = NULL, updated_at = ? WHERE folder_id = ?",
            (now(), fid),
        )
        conn.execute("DELETE FROM conversation_folders WHERE id = ?", (fid,))
        conn.commit()


def get_folder(fid: str) -> dict | None:
    with locked():
        conn = connect()
        row = conn.execute(
            "SELECT id, project_id, name, created_at, updated_at "
            "FROM conversation_folders WHERE id = ?",
            (fid,),
        ).fetchone()
        return dict(row) if row else None


def list_conversations(pid: str) -> list[dict]:
    with locked():
        conn = connect()
        rows = conn.execute(
            "SELECT id, project_id, title, kind, plan_markdown, plan_title, folder_id, "
            "created_at, updated_at "
            "FROM conversations WHERE project_id = ? ORDER BY updated_at DESC",
            (pid,),
        ).fetchall()
        return [_normalize_conversation(dict(r)) for r in rows]


def _public_mode(stored: str) -> str | None:
    return stored if stored in (PLAN, ASK) else None


def _normalize_conversation(row: dict) -> dict:
    stored = normalize_mode(row.get("kind"))
    exposed = _public_mode(stored)
    row.pop("kind", None)
    row["mode"] = exposed
    row["plan_markdown"] = str(row.get("plan_markdown") or "")
    row["plan_title"] = str(row.get("plan_title") or "")
    folder_id = row.get("folder_id")
    row["folder_id"] = folder_id if folder_id else None
    return row


def create_conversation(
    pid: str,
    title: str = "新对话",
    mode: str = "",
    folder_id: str | None = None,
) -> dict:
    cid = f"conv_{uuid.uuid4().hex[:12]}"
    ts = now()
    stored = normalize_mode(mode)
    if not (title or "").strip():
        title = "新对话"
    title = title.strip()
    with locked():
        conn = connect()
        conn.execute(
            "INSERT INTO conversations "
            "(id, project_id, title, kind, plan_markdown, plan_title, folder_id, "
            "created_at, updated_at) "
            "VALUES (?, ?, ?, ?, '', '', ?, ?, ?)",
            (cid, pid, title, stored, folder_id, ts, ts),
        )
        conn.commit()
    return {
        "id": cid,
        "project_id": pid,
        "title": title,
        "mode": stored if stored in (PLAN, ASK) else None,
        "plan_markdown": "",
        "plan_title": "",
        "folder_id": folder_id,
        "created_at": ts,
        "updated_at": ts,
    }


def get_conversation(cid: str) -> dict | None:
    with locked():
        conn = connect()
        row = conn.execute(
            "SELECT id, project_id, title, kind, plan_markdown, plan_title, folder_id, "
            "created_at, updated_at "
            "FROM conversations WHERE id = ?",
            (cid,),
        ).fetchone()
        return _normalize_conversation(dict(row)) if row else None


def set_conversation_folder(cid: str, folder_id: str | None) -> dict | None:
    with locked():
        conn = connect()
        conn.execute(
            "UPDATE conversations SET folder_id = ?, updated_at = ? WHERE id = ?",
            (folder_id, now(), cid),
        )
        conn.commit()
    return get_conversation(cid)


def set_conversation_mode(cid: str, mode: str) -> dict | None:
    stored = normalize_mode(mode)
    with locked():
        conn = connect()
        conn.execute(
            "UPDATE conversations SET kind = ?, updated_at = ? WHERE id = ?",
            (stored, now(), cid),
        )
        conn.commit()
    return get_conversation(cid)


def save_conversation_plan(cid: str, plan_markdown: str, plan_title: str = "") -> None:
    """Persist the live plan. Empty markdown means the conversation has no plan in progress."""
    with locked():
        conn = connect()
        conn.execute(
            "UPDATE conversations SET plan_markdown = ?, plan_title = ?, updated_at = ? "
            "WHERE id = ?",
            (plan_markdown or "", plan_title or "", now(), cid),
        )
        conn.commit()


def rename_conversation(cid: str, title: str) -> None:
    with locked():
        conn = connect()
        conn.execute(
            "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
            ((title or "新对话").strip() or "新对话", now(), cid),
        )
        conn.commit()


def touch_conversation(cid: str) -> None:
    with locked():
        conn = connect()
        conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now(), cid))
        conn.commit()


def delete_conversation(cid: str) -> None:
    """Remove the store row only. Checkpoint cleanup belongs to ConversationService."""
    with locked():
        conn = connect()
        conn.execute("DELETE FROM conversations WHERE id = ?", (cid,))
        conn.execute("DELETE FROM llm_usage WHERE conversation_id = ?", (cid,))
        conn.commit()
