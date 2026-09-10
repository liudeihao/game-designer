"""Disk layout for illustration records (not docs/)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.docs._store import ensure_seeded, load_revs, project_studio_dir

SETTINGS_NAME = "illustration.json"
RECORDS_DIR = "illustrations"

HOMES = ("doc", "unbound", "draft")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_json(path: Path) -> Any | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError):
        return None


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def new_id() -> str:
    return f"ill_{uuid.uuid4().hex[:12]}"


def settings_path(project_id: str) -> Path:
    return project_studio_dir(project_id) / SETTINGS_NAME


def records_root(project_id: str) -> Path:
    return project_studio_dir(project_id) / RECORDS_DIR


def record_dir(project_id: str, illustration_id: str) -> Path:
    return records_root(project_id) / illustration_id


def default_settings() -> dict[str, Any]:
    return {"style_text": "", "use_style_default": True}


def load_settings(project_id: str) -> dict[str, Any]:
    ensure_seeded(project_id)
    raw = _read_json(settings_path(project_id))
    if not isinstance(raw, dict):
        return default_settings()
    return {
        "style_text": str(raw.get("style_text") or ""),
        "use_style_default": bool(raw.get("use_style_default", True)),
    }


def save_settings(project_id: str, *, style_text: str | None = None, use_style_default: bool | None = None) -> dict[str, Any]:
    current = load_settings(project_id)
    if style_text is not None:
        current["style_text"] = str(style_text)
    if use_style_default is not None:
        current["use_style_default"] = bool(use_style_default)
    _write_json(settings_path(project_id), current)
    return current


def write_record(
    project_id: str,
    record: dict[str, Any],
    image: bytes,
    ext: str = "png",
) -> dict[str, Any]:
    iid = str(record["id"])
    folder = record_dir(project_id, iid)
    folder.mkdir(parents=True, exist_ok=True)
    suffix = (ext or "png").lstrip(".").lower() or "png"
    image_name = f"image.{suffix}"
    (folder / image_name).write_bytes(image)
    stored = dict(record)
    stored["image_name"] = image_name
    _write_json(folder / "record.json", stored)
    return stored


def read_record(project_id: str, illustration_id: str) -> dict[str, Any] | None:
    ensure_seeded(project_id)
    raw = _read_json(record_dir(project_id, illustration_id) / "record.json")
    return dict(raw) if isinstance(raw, dict) and raw.get("id") else None


def list_records(project_id: str) -> list[dict[str, Any]]:
    ensure_seeded(project_id)
    root = records_root(project_id)
    if not root.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for child in root.iterdir():
        if not child.is_dir():
            continue
        raw = _read_json(child / "record.json")
        if isinstance(raw, dict) and raw.get("id"):
            out.append(dict(raw))
    out.sort(key=lambda row: str(row.get("created_at") or ""), reverse=True)
    return out


def save_record_meta(project_id: str, record: dict[str, Any]) -> dict[str, Any]:
    """Rewrite record.json only (never the image or prompt)."""
    iid = str(record["id"])
    folder = record_dir(project_id, iid)
    if not (folder / "record.json").is_file():
        raise FileNotFoundError(iid)
    _write_json(folder / "record.json", record)
    return record


def image_file(project_id: str, illustration_id: str) -> Path | None:
    rec = read_record(project_id, illustration_id)
    if rec is None:
        return None
    name = str(rec.get("image_name") or "image.png")
    path = record_dir(project_id, illustration_id) / name
    return path if path.is_file() else None


def is_stale(record: dict[str, Any], project_id: str) -> bool:
    if record.get("draft"):
        return False
    linked = str(record.get("linked_doc") or "").strip()
    if not linked:
        return False
    try:
        pinned = int(record.get("linked_rev"))
    except (TypeError, ValueError):
        return False
    current = load_revs(project_id).get(linked)
    if current is None:
        return False
    return int(current) > pinned


def public_record(record: dict[str, Any], project_id: str) -> dict[str, Any]:
    home = "draft"
    if record.get("draft"):
        home = "draft"
    elif str(record.get("linked_doc") or "").strip():
        home = "doc"
    else:
        home = "unbound"
    return {
        "id": record.get("id"),
        "prompt": record.get("prompt") or "",
        "extras": record.get("extras") or "",
        "style_used": bool(record.get("style_used")),
        "style_text": record.get("style_text") or "",
        "linked_doc": record.get("linked_doc") or None,
        "linked_rev": record.get("linked_rev"),
        "draft": bool(record.get("draft")),
        "home": home,
        "stale": is_stale(record, project_id),
        "created_at": record.get("created_at") or _now(),
        "conversation_id": record.get("conversation_id") or None,
    }
