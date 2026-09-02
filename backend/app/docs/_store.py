"""Markdown docs workspace with file-level OCC.

Layout under ``{DATA_DIR}/projects/{project_id}/``::

    docs/                # user markdown (starts empty)
    .studio/
      meta.json          # {"schema_version":1,"revs":{},"updated_at":"..."}
      plans/             # archived plans, one file per Execute Plan
      rules.json         # Project Rule items (not a design doc)

Editions live in ``.studio/meta.json`` ``revs``, not in the markdown files.
"""

from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app import config

_lock = threading.Lock()


class DocsWriteConflict(Exception):
    """Whole-batch reject: at least one file changed since ``based_on``."""

    def __init__(self, conflicts: list[dict[str, Any]]):
        self.conflicts = list(conflicts)
        super().__init__("docs write conflict")


def project_root(project_id: str) -> Path:
    return config.data_dir() / "projects" / project_id


def project_docs_dir(project_id: str) -> Path:
    return project_root(project_id) / "docs"


def project_studio_dir(project_id: str) -> Path:
    return project_root(project_id) / ".studio"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _meta_path(project_id: str) -> Path:
    return project_studio_dir(project_id) / "meta.json"


def _empty_meta(schema_version: int = 1) -> dict[str, Any]:
    return {"schema_version": int(schema_version or 1), "revs": {}, "updated_at": _now()}


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


def _read_meta(project_id: str) -> dict[str, Any]:
    raw = _read_json(_meta_path(project_id))
    if not isinstance(raw, dict):
        return _empty_meta()
    return raw


def revs_from_meta(meta: dict[str, Any] | None) -> dict[str, int]:
    raw = (meta or {}).get("revs")
    if not isinstance(raw, dict):
        return {}
    out: dict[str, int] = {}
    for key, value in raw.items():
        try:
            out[str(key)] = int(value or 0)
        except (TypeError, ValueError):
            continue
    return out


def load_revs(project_id: str) -> dict[str, int]:
    return revs_from_meta(_read_meta(project_id))


def has_docs_prefix(path: str) -> bool:
    """True when a path redundantly repeats the ``docs/`` root it is relative to."""
    raw = (path or "").replace("\\", "/").strip().lstrip("/")
    return raw.split("/", 1)[0] == "docs"


def normalize_rel_path(path: str) -> str:
    """Normalize a docs-relative path; allow ``.md`` files and nested dirs."""
    raw = (path or "").replace("\\", "/").strip()
    if not raw or raw in (".", "./"):
        return ""
    if raw.startswith("/") or re.match(r"^[A-Za-z]:/", raw):
        raise ValueError("absolute path not allowed")
    parts: list[str] = []
    for part in raw.lstrip("/").split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            raise ValueError("path escapes workspace")
        parts.append(part)
    # Paths are already relative to docs/; a leading docs/ would nest a second one.
    if parts and parts[0] == "docs":
        parts = parts[1:]
    rel = "/".join(parts)
    if not rel:
        return ""
    name = parts[-1]
    if "." in name and not name.lower().endswith(".md"):
        raise ValueError("only .md files are allowed under docs/")
    return rel


def ensure_seeded(project_id: str) -> None:
    """Create docs/, .studio/meta.json, and .studio/plans/ if missing."""
    docs = project_docs_dir(project_id)
    studio = project_studio_dir(project_id)
    plans = studio / "plans"
    meta_path = studio / "meta.json"

    with _lock:
        docs.mkdir(parents=True, exist_ok=True)
        plans.mkdir(parents=True, exist_ok=True)
        if not meta_path.is_file():
            _write_json(meta_path, _empty_meta())


def list_files(project_id: str, path: str = "") -> list[dict[str, Any]]:
    """List files/dirs under docs/ (relative paths)."""
    ensure_seeded(project_id)
    root = project_docs_dir(project_id)
    rel = normalize_rel_path(path)
    base = root / rel if rel else root
    if not base.exists():
        return []
    if base.is_file():
        return [{"path": rel, "type": "file", "bytes": base.stat().st_size}]
    entries: list[dict[str, Any]] = []
    try:
        children = sorted(base.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except OSError:
        return []
    for child in children:
        child_rel = f"{rel}/{child.name}" if rel else child.name
        if child.is_dir():
            entries.append({"path": child_rel, "type": "dir"})
        elif child.is_file():
            entries.append({"path": child_rel, "type": "file", "bytes": child.stat().st_size})
    return entries


def read_file(project_id: str, path: str) -> dict[str, Any]:
    """Read one markdown file and its OCC rev."""
    ensure_seeded(project_id)
    rel = normalize_rel_path(path)
    if not rel or not rel.lower().endswith(".md"):
        return {"ok": False, "error": "path must be a .md file", "path": rel}
    root = project_docs_dir(project_id)
    target = (root / rel).resolve()
    try:
        target.relative_to(root.resolve())
    except ValueError:
        return {"ok": False, "error": "path escapes workspace", "path": rel}
    if not target.is_file():
        return {"ok": False, "error": f"file not found: {rel}", "path": rel}
    try:
        content = target.read_text(encoding="utf-8")
    except OSError as exc:
        return {"ok": False, "error": str(exc), "path": rel}
    revs = load_revs(project_id)
    rev = revs.get(rel)
    if rev is None:
        rev = 0
    return {"ok": True, "path": rel, "content": content, "rev": int(rev)}


def load_workspace(project_id: str) -> dict[str, str]:
    """Load all markdown files under docs/ as ``path → content``."""
    ensure_seeded(project_id)
    root = project_docs_dir(project_id)
    files: dict[str, str] = {}
    if not root.is_dir():
        return files
    for path in sorted(root.rglob("*.md")):
        if not path.is_file():
            continue
        try:
            rel = path.relative_to(root).as_posix()
        except ValueError:
            continue
        try:
            files[rel] = path.read_text(encoding="utf-8")
        except OSError:
            continue
    return files


def workspace_snapshot(project_id: str) -> dict[str, Any]:
    """Return ``{files, revs}`` for API responses."""
    ensure_seeded(project_id)
    return {"files": load_workspace(project_id), "revs": load_revs(project_id)}


def write_files(
    project_id: str,
    writes: dict[str, str | None],
    based_on: dict[str, int | None],
) -> dict[str, Any]:
    """Write/delete markdown files with file-level OCC."""
    ensure_seeded(project_id)
    if not writes:
        return workspace_snapshot(project_id)

    normalized: dict[str, str | None] = {}
    for raw_path, content in writes.items():
        rel = normalize_rel_path(raw_path)
        if not rel or not rel.lower().endswith(".md"):
            raise ValueError(f"invalid docs path: {raw_path!r}")
        normalized[rel] = content

    root = project_docs_dir(project_id)
    meta_path = _meta_path(project_id)

    with _lock:
        meta = _read_meta(project_id)
        revs = revs_from_meta(meta)
        conflicts: list[dict[str, Any]] = []

        for rel in normalized:
            expected = based_on.get(rel) if isinstance(based_on, dict) else None
            if expected is not None:
                try:
                    expected = int(expected)
                except (TypeError, ValueError):
                    expected = 0
            disk_path = root / rel
            exists = disk_path.is_file()
            if exists:
                actual: int | None = int(revs[rel]) if rel in revs else 0
            else:
                actual = None
            if expected != actual:
                conflicts.append(
                    {
                        "path": rel,
                        "expected_rev": expected,
                        "actual_rev": actual,
                    }
                )

        if conflicts:
            raise DocsWriteConflict(conflicts)

        for rel, content in normalized.items():
            target = root / rel
            if content is None:
                target.unlink(missing_ok=True)
                revs.pop(rel, None)
                parent = target.parent
                while parent != root and parent.is_dir():
                    try:
                        next(parent.iterdir())
                    except StopIteration:
                        parent.rmdir()
                        parent = parent.parent
                    except OSError:
                        break
                    else:
                        break
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                tmp = target.with_suffix(target.suffix + ".tmp")
                tmp.write_text(content, encoding="utf-8")
                tmp.replace(target)
                prev = revs.get(rel)
                revs[rel] = (int(prev) + 1) if prev is not None else 1

        meta["revs"] = revs
        meta["schema_version"] = int(meta.get("schema_version") or 1)
        meta["updated_at"] = _now()
        _write_json(meta_path, meta)

    return workspace_snapshot(project_id)


def workspace_card(files: dict[str, str] | None, *, empty_hint: bool = True) -> str:
    """Short Chinese fingerprint for agent prompts."""
    files = files if isinstance(files, dict) else {}
    names = sorted(files.keys())
    if empty_hint and not names:
        return "workspace: empty"
    if empty_hint and names == ["README.md"]:
        return "workspace: empty (README only)"
    preview = ", ".join(names[:8])
    more = f" (+{len(names) - 8})" if len(names) > 8 else ""
    return f"workspace: {len(names)} files — {preview}{more}"


DEFAULT_PLAN_TITLE = "未命名计划"

_H1 = re.compile(r"^#\s+(.+?)\s*$")


def _plan_slug(title: str) -> str:
    """Filesystem-safe slug. ``\\w`` keeps CJK, so Chinese titles stay readable."""
    slug = re.sub(r"[^\w]+", "-", (title or "").strip()).strip("-")
    return slug[:40]


def plan_title_from_markdown(markdown: str, default: str = DEFAULT_PLAN_TITLE) -> str:
    """First H1 line, or ``default``."""
    for line in (markdown or "").splitlines():
        match = _H1.match(line.strip())
        if match:
            return match.group(1).strip() or default
        if line.strip():
            break
    return default


def _with_title_heading(markdown: str, title: str) -> str:
    body = (markdown or "").strip()
    if plan_title_from_markdown(body, "") == title.strip():
        return body + "\n"
    return f"# {title.strip()}\n\n{body}\n"


def write_plan_snapshot(
    project_id: str,
    conversation_id: str,
    markdown: str,
    title: str = "",
) -> str:
    """Archive an executed plan under ``.studio/plans/``; return the project-relative path.

    The title is written as an H1 so the file describes itself and
    :func:`list_plan_snapshots` needs no side index.
    """
    ensure_seeded(project_id)
    cid = re.sub(r"[^\w\-]+", "_", (conversation_id or "plan").strip()) or "plan"
    plans = project_studio_dir(project_id) / "plans"
    plans.mkdir(parents=True, exist_ok=True)
    # Tolerate legacy ``{cid}-{n}.md`` names when picking the next number.
    pattern = re.compile(rf"^{re.escape(cid)}-(\d+)(?:-.*)?\.md$", re.IGNORECASE)
    max_n = 0
    for child in plans.iterdir():
        if not child.is_file():
            continue
        match = pattern.match(child.name)
        if match:
            max_n = max(max_n, int(match.group(1)))
    n = max_n + 1
    text = markdown if isinstance(markdown, str) else str(markdown or "")
    name = (title or "").strip() or plan_title_from_markdown(text)
    slug = _plan_slug(name)
    rel = f".studio/plans/{cid}-{n}-{slug}.md" if slug else f".studio/plans/{cid}-{n}.md"
    target = project_root(project_id) / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(_with_title_heading(text, name), encoding="utf-8")
    return rel


def list_plan_snapshots(project_id: str, conversation_id: str = "") -> list[dict[str, Any]]:
    """Archived plans, newest first. Optionally scoped to one conversation."""
    ensure_seeded(project_id)
    plans = project_studio_dir(project_id) / "plans"
    if not plans.is_dir():
        return []
    cid = re.sub(r"[^\w\-]+", "_", (conversation_id or "").strip())
    pattern = re.compile(rf"^{re.escape(cid)}-(\d+)(?:-.*)?\.md$", re.IGNORECASE) if cid else None

    out: list[dict[str, Any]] = []
    for child in sorted(plans.iterdir()):
        if not child.is_file() or child.suffix.lower() != ".md":
            continue
        seq = 0
        if pattern is not None:
            match = pattern.match(child.name)
            if not match:
                continue
            seq = int(match.group(1))
        try:
            text = child.read_text(encoding="utf-8")
        except OSError:
            continue
        out.append(
            {
                "path": f".studio/plans/{child.name}",
                "title": plan_title_from_markdown(text),
                "seq": seq,
                "created_at": datetime.fromtimestamp(
                    child.stat().st_mtime, tz=timezone.utc
                ).isoformat(),
            }
        )
    out.sort(key=lambda item: (item["seq"], item["created_at"]), reverse=True)
    return out


def read_plan_snapshot(project_id: str, rel_path: str) -> str:
    """Read a plan snapshot by path relative to the project root."""
    raw = (rel_path or "").replace("\\", "/").strip().lstrip("/")
    if not raw.startswith(".studio/plans/") or ".." in raw.split("/"):
        raise ValueError("invalid plan snapshot path")
    target = (project_root(project_id) / raw).resolve()
    studio_plans = (project_studio_dir(project_id) / "plans").resolve()
    try:
        target.relative_to(studio_plans)
    except ValueError as exc:
        raise ValueError("path escapes plans directory") from exc
    if not target.is_file():
        raise FileNotFoundError(raw)
    return target.read_text(encoding="utf-8")


def wipe(project_id: str) -> None:
    """Remove docs + .studio for a project."""
    import shutil

    root = config.data_dir() / "projects" / project_id
    for name in ("docs", ".studio"):
        path = root / name
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)
        elif path.is_file():
            path.unlink(missing_ok=True)
