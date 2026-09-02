"""Per-turn Markdown docs session bound to a project on disk.

Paths are relative to ``docs/``. Reads/list/grep use a turn-local cache so
same-turn writes are visible. Writes go through :func:`write_files` immediately;
OCC conflicts become this Tool Call's error. Disk is the authority.
"""

from __future__ import annotations

from typing import Any

from app.docs._store import (
    DocsWriteConflict,
    has_docs_prefix,
    normalize_rel_path,
    workspace_snapshot,
    write_files,
)

DOCS_PREFIX_NOTE = (
    "路径相对 docs/，不要带 docs/ 前缀；本次已自动纠正。"
    "规范写法如 愿景.md、系统/经济.md。"
)

CONFLICT_HINT = "先 workspace_read 重读该文件再重试。"


class DocsSession:
    """Turn-local cache over ``projects/{id}/docs/``; mutations persist on call."""

    def __init__(
        self,
        project_id: str = "",
        *,
        writable: bool = True,
        require_read_before_write: bool = False,
    ):
        self.project_id = str(project_id or "")
        self.files: dict[str, str] = {}
        self.revs: dict[str, int] = {}
        self.writes: list[dict[str, Any]] = []
        self.require_read_before_write = bool(require_read_before_write)
        self.writable = bool(writable)
        self.read_paths: set[str] = set()
        self.listed_dirs: set[str] = set()  # "" means root listed
        self._reload()

    def _reload(self) -> None:
        if not self.project_id:
            self.files = {}
            self.revs = {}
            return
        snap = workspace_snapshot(self.project_id)
        self.files = {
            str(k): ("" if v is None else str(v))
            for k, v in (snap.get("files") or {}).items()
        }
        self.revs = {}
        for key, value in (snap.get("revs") or {}).items():
            try:
                self.revs[str(key)] = int(value)
            except (TypeError, ValueError):
                continue

    def _expected_rev(self, path: str) -> int | None:
        if path not in self.files:
            return None
        if path in self.revs:
            return self.revs[path]
        return 0

    def _persist(self, batch: dict[str, str | None]) -> dict[str, Any]:
        if not self.project_id:
            return {"ok": False, "error": "没有绑定项目，无法写入工作区。"}
        if not batch:
            return {"ok": True, "snapshot": {"files": dict(self.files), "revs": dict(self.revs)}}
        based_on = {path: self._expected_rev(path) for path in batch}
        try:
            snap = write_files(self.project_id, batch, based_on=based_on)
        except DocsWriteConflict as exc:
            self._reload()
            return {
                "ok": False,
                "error": "工作区写入冲突：文件已在本回合外被更新。",
                "conflicts": list(getattr(exc, "conflicts", None) or []),
                "hint": CONFLICT_HINT,
            }
        except ValueError as exc:
            return {"ok": False, "error": str(exc)}
        self.files = {
            str(k): ("" if v is None else str(v))
            for k, v in (snap.get("files") or {}).items()
        }
        self.revs = {}
        for key, value in (snap.get("revs") or {}).items():
            try:
                self.revs[str(key)] = int(value)
            except (TypeError, ValueError):
                continue
        return {"ok": True, "snapshot": snap}

    def _rev_of(self, path: str) -> int | None:
        if path not in self.revs:
            return None
        return self.revs[path]

    # --- guards ------------------------------------------------------------- #

    def _mark_read(self, path: str) -> None:
        try:
            rel = normalize_rel_path(path)
        except ValueError:
            return
        if rel:
            self.read_paths.add(rel)

    def _mark_listed(self, path: str) -> None:
        try:
            rel = normalize_rel_path(path) if path else ""
        except ValueError:
            return
        self.listed_dirs.add(rel)

    def _readonly_block(self, op: str) -> dict[str, Any]:
        return {
            "ok": False,
            "error": f"当前工作区为只读，不能 {op}。Ask 与 Plan 不能改工作区；请回到 Agent 常态后再改设计文档。",
        }

    def _write_guard(self, rel: str, *, op: str) -> dict[str, Any] | None:
        """Block edits to files this turn has not read. Creating new files is free.

        ``write`` overwrites whole files, so editing an unread file silently
        drops whatever was there.
        """
        if not self.require_read_before_write:
            return None
        exists = rel in self.files
        if op in {"update", "delete", "replace"} and exists and rel not in self.read_paths:
            return {
                "ok": False,
                "error": "先读后写：修改/删除已有文件前必须 workspace_read。",
                "path": rel,
                "hint": f"先 workspace_read {rel}，再重试。",
            }
        return None

    # --- reads -------------------------------------------------------------- #

    def list(self, path: str = "") -> dict[str, Any]:
        from app.docs._ops import workspace_list

        result = workspace_list(self.files, path=path)
        if result.get("ok"):
            self._mark_listed(path or "")
        return result

    def read(self, path: str) -> dict[str, Any]:
        from app.docs._ops import workspace_read

        result = workspace_read(self.files, path)
        if result.get("ok") and result.get("type") != "dir":
            rel = str(result.get("path") or path)
            self._mark_read(rel)
        elif result.get("ok") and result.get("type") == "dir":
            self._mark_listed(str(result.get("path") or path))
        return result

    def grep(self, pattern: str, *, path: str = "", max_matches: int = 40) -> dict[str, Any]:
        from app.docs._ops import workspace_grep

        return workspace_grep(self.files, pattern, path=path, max_matches=max_matches)

    # --- writes ------------------------------------------------------------- #

    def write(self, files: list[dict[str, Any]] | str, content: str | None = None) -> dict[str, Any]:
        """Create or overwrite one or more markdown files (full content string).

        Accepts either ``write([{path, content}, ...])`` or ``write(path, content)``.
        Persists the whole batch in one OCC call.
        """
        if not self.writable:
            return self._readonly_block("写入")
        if isinstance(files, str):
            if content is None:
                return {"ok": False, "error": "content is required"}
            file_items: list[dict[str, Any]] = [{"path": files, "content": content}]
        else:
            file_items = list(files or [])
        if not file_items:
            return {"ok": False, "error": "files is required"}

        pending: list[tuple[str, str, bool]] = []
        corrected = False
        for item in file_items:
            path = str(item.get("path") or "").strip()
            corrected = corrected or has_docs_prefix(path)
            body = item.get("content")
            if not path:
                return {"ok": False, "error": "each file needs path"}
            try:
                rel = normalize_rel_path(path)
            except ValueError as exc:
                return {"ok": False, "error": str(exc)}
            if not rel or not rel.lower().endswith(".md"):
                return {
                    "ok": False,
                    "error": "path must be a .md file under docs/",
                    "path": rel or path,
                }
            if not isinstance(body, str):
                return {
                    "ok": False,
                    "error": "content must be a markdown string",
                    "path": rel,
                }
            exists = rel in self.files
            op = "update" if exists else "add"
            blocked = self._write_guard(rel, op=op)
            if blocked:
                return blocked
            pending.append((rel, body, not exists))

        batch = {rel: body for rel, body, _created in pending}
        persisted = self._persist(batch)
        if persisted.get("ok") is False:
            return persisted

        results: list[dict[str, Any]] = []
        for rel, _body, created in pending:
            step = {
                "path": rel,
                "op": "write",
                "created": created,
                "rev": self._rev_of(rel),
            }
            self.read_paths.add(rel)
            self.writes.append({"path": rel, "op": "write", "created": created})
            results.append(step)
        out: dict[str, Any] = {
            "ok": True,
            "op": "write",
            "count": len(results),
            "results": results,
        }
        if corrected:
            out["note"] = DOCS_PREFIX_NOTE
        return out

    def search_replace(self, path: str, old: str, new: str) -> dict[str, Any]:
        """Replace the first occurrence of ``old`` with ``new`` in a file."""
        if not self.writable:
            return self._readonly_block("替换")
        try:
            rel = normalize_rel_path(path)
        except ValueError as exc:
            return {"ok": False, "error": str(exc)}
        if not rel or not rel.lower().endswith(".md"):
            return {"ok": False, "error": "path must be a .md file under docs/", "path": rel or path}
        if rel not in self.files:
            return {
                "ok": False,
                "error": f"文件不存在，无法 search_replace：{rel}",
                "path": rel,
                "hint": "新建文件请用 workspace_write。",
            }
        if not isinstance(old, str) or old == "":
            return {"ok": False, "error": "old must be a non-empty string", "path": rel}
        if not isinstance(new, str):
            return {"ok": False, "error": "new must be a string", "path": rel}
        blocked = self._write_guard(rel, op="replace")
        if blocked:
            return blocked
        text = self.files[rel]
        if old not in text:
            return {
                "ok": False,
                "error": "old 文本未在文件中找到",
                "path": rel,
            }
        next_text = text.replace(old, new, 1)
        persisted = self._persist({rel: next_text})
        if persisted.get("ok") is False:
            return persisted
        self.read_paths.add(rel)
        self.writes.append({"path": rel, "op": "search_replace", "old": old, "new": new})
        out: dict[str, Any] = {
            "ok": True,
            "path": rel,
            "op": "search_replace",
            "old": old,
            "new": new,
            "rev": self._rev_of(rel),
        }
        if has_docs_prefix(path):
            out["note"] = DOCS_PREFIX_NOTE
        return out

    def delete(self, paths: list[str] | str) -> dict[str, Any]:
        """Delete one or more files from the working tree."""
        if not self.writable:
            return self._readonly_block("删除")
        if isinstance(paths, str):
            path_list = [paths]
        else:
            path_list = list(paths or [])
        if not path_list:
            return {"ok": False, "error": "paths is required"}
        pending: list[str] = []
        corrected = False
        for path in path_list:
            corrected = corrected or has_docs_prefix(path)
            try:
                rel = normalize_rel_path(path)
            except ValueError as exc:
                return {"ok": False, "error": str(exc)}
            if not rel:
                return {"ok": False, "error": "path is required"}
            if not rel.lower().endswith(".md"):
                return {
                    "ok": False,
                    "error": "path must be a .md file under docs/",
                    "path": rel,
                }
            blocked = self._write_guard(rel, op="delete")
            if blocked:
                return blocked
            pending.append(rel)

        persisted = self._persist({rel: None for rel in pending})
        if persisted.get("ok") is False:
            return persisted
        deleted: list[dict[str, Any]] = []
        for rel in pending:
            step = {"path": rel, "op": "delete"}
            self.writes.append(step)
            deleted.append(step)
        out: dict[str, Any] = {"ok": True, "op": "delete", "count": len(deleted), "results": deleted}
        if corrected:
            out["note"] = DOCS_PREFIX_NOTE
        return out

    def summary_line(self) -> str:
        if not self.writes:
            return ""
        writes = sum(1 for w in self.writes if w.get("op") == "write")
        replaces = sum(1 for w in self.writes if w.get("op") == "search_replace")
        deletes = sum(1 for w in self.writes if w.get("op") == "delete")
        paths = ", ".join(str(w.get("path")) for w in self.writes[-8:])
        bits: list[str] = []
        if writes:
            bits.append(f"写入 {writes}")
        if replaces:
            bits.append(f"替换 {replaces}")
        if deletes:
            bits.append(f"删除 {deletes}")
        return "、".join(bits) + f" 个文件（{paths}）"
