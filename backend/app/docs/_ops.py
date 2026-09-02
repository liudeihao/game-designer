"""Coding-agent style workspace ops over Markdown docs files.

Paths are relative to ``projects/{id}/docs/`` (e.g. ``战斗.md``,
``系统/经济.md``). ``DocsSession`` keeps a turn-local cache of this map
so list/grep/read see same-turn writes; disk remains the authority.
"""

from __future__ import annotations

import re
from typing import Any, Optional

from app.docs._store import normalize_rel_path, workspace_card as format_workspace_card


def _as_files(files: Any) -> dict[str, str]:
    if isinstance(files, dict):
        # Ignore accidental workspace snapshot wrappers.
        if "files" in files and isinstance(files.get("files"), dict) and "revs" in files:
            files = files["files"]
        return {str(k): ("" if v is None else str(v)) for k, v in files.items()}
    return {}


def workspace_card(files: Any, *, empty_hint: bool = True) -> str:
    """Short fingerprint for agent prompts (empty/README-only vs file list)."""
    return format_workspace_card(_as_files(files), empty_hint=empty_hint)


def workspace_list(files: Any, path: str = "") -> dict[str, Any]:
    """List files/dirs under a docs-relative path."""
    try:
        rel = normalize_rel_path(path)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), "entries": []}

    tree = _as_files(files)
    if not rel:
        dirs: set[str] = set()
        root_files: list[dict[str, Any]] = []
        for file_path, content in tree.items():
            if "/" in file_path:
                dirs.add(file_path.split("/", 1)[0])
            else:
                root_files.append(
                    {"path": file_path, "type": "file", "bytes": len(content.encode("utf-8"))}
                )
        entries = [{"path": d, "type": "dir"} for d in sorted(dirs)]
        entries.extend(sorted(root_files, key=lambda e: e["path"]))
        return {"ok": True, "path": "", "count": len(entries), "entries": entries}

    if rel in tree:
        content = tree[rel]
        return {
            "ok": True,
            "path": rel,
            "count": 1,
            "entries": [{"path": rel, "type": "file", "bytes": len(content.encode("utf-8"))}],
        }

    prefix = rel.rstrip("/") + "/"
    children_dirs: set[str] = set()
    children_files: list[dict[str, Any]] = []
    for file_path, content in tree.items():
        if not file_path.startswith(prefix):
            continue
        rest = file_path[len(prefix) :]
        if "/" in rest:
            children_dirs.add(rest.split("/", 1)[0])
        else:
            children_files.append(
                {
                    "path": f"{rel}/{rest}",
                    "type": "file",
                    "bytes": len(content.encode("utf-8")),
                }
            )
    entries = [{"path": f"{rel}/{d}", "type": "dir"} for d in sorted(children_dirs)]
    entries.extend(sorted(children_files, key=lambda e: e["path"]))
    if not entries:
        return {"ok": False, "error": f"path not found: {rel}", "entries": []}
    return {"ok": True, "path": rel, "count": len(entries), "entries": entries}


def workspace_read(files: Any, path: str) -> dict[str, Any]:
    """Read one docs file by relative path."""
    try:
        rel = normalize_rel_path(path)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    if not rel:
        return {"ok": False, "error": "path is required"}

    tree = _as_files(files)

    # Directory → inventory only
    if not rel.lower().endswith(".md") and any(
        p.startswith(rel.rstrip("/") + "/") for p in tree
    ):
        listed = workspace_list(tree, path=rel)
        if not listed.get("ok"):
            return listed
        return {
            "ok": True,
            "path": rel,
            "type": "dir",
            "message": "这是目录；请对具体 *.md 文件调用 workspace_read。",
            "entries": listed.get("entries") or [],
        }

    if rel not in tree:
        alt = f"{rel}.md" if not rel.lower().endswith(".md") else ""
        if alt and alt in tree:
            rel = alt
        else:
            return {
                "ok": False,
                "error": f"file not found: {rel}",
                "hint": "use workspace_list; paths look like 战斗.md or 系统/经济.md",
            }

    content = tree[rel]
    if len(content) > 40_000:
        return {
            "ok": True,
            "path": rel,
            "truncated": True,
            "content": content[:40_000],
            "message": "文件过大，已截断；请用 workspace_grep 定位后再读更小片段。",
            "bytes": len(content.encode("utf-8")),
        }
    return {
        "ok": True,
        "path": rel,
        "content": content,
        "bytes": len(content.encode("utf-8")),
    }


def workspace_grep(
    files: Any,
    pattern: str,
    *,
    path: str = "",
    max_matches: int = 40,
) -> dict[str, Any]:
    """Search markdown file contents."""
    pattern = (pattern or "").strip()
    if not pattern:
        return {"ok": False, "error": "pattern is required", "matches": []}
    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error as exc:
        return {"ok": False, "error": f"invalid regex: {exc}", "matches": []}

    try:
        rel = normalize_rel_path(path) if path else ""
    except ValueError as exc:
        return {"ok": False, "error": str(exc), "matches": []}

    tree = _as_files(files)
    matches: list[dict[str, Any]] = []
    for file_path, content in sorted(tree.items()):
        if rel:
            if file_path != rel and not file_path.startswith(rel.rstrip("/") + "/"):
                continue
        for i, line in enumerate(content.splitlines(), start=1):
            if regex.search(line):
                matches.append({"path": file_path, "line": i, "text": line[:240]})
                if len(matches) >= max(1, min(int(max_matches or 40), 200)):
                    return {
                        "ok": True,
                        "truncated": True,
                        "count": len(matches),
                        "matches": matches,
                    }
    return {"ok": True, "truncated": False, "count": len(matches), "matches": matches}


def conversation_get_summary(summary: Optional[str]) -> dict[str, Any]:
    text = (summary or "").strip()
    if not text:
        return {
            "ok": True,
            "empty": True,
            "summary": "",
            "message": "尚无对话摘要（历史较短或未触发压缩）。",
        }
    return {"ok": True, "empty": False, "summary": text}
