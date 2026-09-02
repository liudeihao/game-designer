"""Project rows in the SQLite store."""

from __future__ import annotations

import uuid

from app.docs import wipe

from ._connection import connect, locked, now


def list_projects() -> list[dict]:
    with locked():
        conn = connect()
        rows = conn.execute(
            "SELECT id, name, label, created_at, updated_at, initial_plan_done "
            "FROM projects ORDER BY updated_at DESC"
        ).fetchall()
        return [_normalize_project(dict(r)) for r in rows]


def _normalize_project(row: dict) -> dict:
    row["initial_plan_done"] = bool(row.get("initial_plan_done"))
    row["label"] = str(row.get("label") or "").strip()
    return row


def create_project(name: str, label: str = "") -> dict:
    pid = f"proj_{uuid.uuid4().hex[:12]}"
    ts = now()
    clean_name = name.strip() or "未命名游戏"
    clean_label = (label or "").strip()
    with locked():
        conn = connect()
        conn.execute(
            "INSERT INTO projects (id, name, label, created_at, updated_at, initial_plan_done) "
            "VALUES (?, ?, ?, ?, ?, 0)",
            (pid, clean_name, clean_label, ts, ts),
        )
        conn.commit()
    return {
        "id": pid,
        "name": clean_name,
        "label": clean_label,
        "created_at": ts,
        "updated_at": ts,
        "initial_plan_done": False,
    }


def get_project(pid: str) -> dict | None:
    with locked():
        conn = connect()
        row = conn.execute(
            "SELECT id, name, label, created_at, updated_at, initial_plan_done "
            "FROM projects WHERE id = ?",
            (pid,),
        ).fetchone()
        return _normalize_project(dict(row)) if row else None


def mark_initial_plan_done(pid: str) -> None:
    with locked():
        conn = connect()
        conn.execute(
            "UPDATE projects SET initial_plan_done = 1, updated_at = ? WHERE id = ?",
            (now(), pid),
        )
        conn.commit()


def ensure_initial_plan_done_flag(pid: str) -> bool:
    """Backfill: any conversation that left plan phase with a saved plan counts as done."""
    project = get_project(pid)
    if not project:
        return False
    if project.get("initial_plan_done"):
        return True
    with locked():
        conn = connect()
        row = conn.execute(
            "SELECT 1 FROM conversations "
            "WHERE project_id = ? AND kind NOT IN ('plan', 'ask') AND TRIM(plan_markdown) != '' "
            "LIMIT 1",
            (pid,),
        ).fetchone()
    if row:
        mark_initial_plan_done(pid)
        return True
    return False


def touch_project(pid: str) -> None:
    with locked():
        conn = connect()
        conn.execute("UPDATE projects SET updated_at = ? WHERE id = ?", (now(), pid))
        conn.commit()


def rename_project(pid: str, name: str) -> None:
    with locked():
        conn = connect()
        conn.execute(
            "UPDATE projects SET name = ?, updated_at = ? WHERE id = ?", (name, now(), pid)
        )
        conn.commit()


def update_project(
    pid: str,
    *,
    name: str | None = None,
    label: str | None = None,
) -> dict | None:
    """Update project fields; omit a kwarg to leave it unchanged."""
    with locked():
        conn = connect()
        row = conn.execute(
            "SELECT id, name, label, created_at, updated_at, initial_plan_done "
            "FROM projects WHERE id = ?",
            (pid,),
        ).fetchone()
        if not row:
            return None
        current = _normalize_project(dict(row))
        new_name = current["name"] if name is None else (name.strip() or "未命名游戏")
        new_label = current["label"] if label is None else label.strip()
        conn.execute(
            "UPDATE projects SET name = ?, label = ?, updated_at = ? WHERE id = ?",
            (new_name, new_label, now(), pid),
        )
        conn.commit()
    return get_project(pid)


def delete_project(pid: str) -> None:
    with locked():
        conn = connect()
        conn.execute("DELETE FROM projects WHERE id = ?", (pid,))
        conn.execute("DELETE FROM conversations WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM llm_usage WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM conversation_folders WHERE project_id = ?", (pid,))
        conn.commit()
    wipe(pid)
