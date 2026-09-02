"""User project Markdown docs (docs/ + .studio/ on disk).

Layout under ``{DATA_DIR}/projects/{project_id}/``::

    docs/                 # design markdown
    .studio/meta.json     # file-level OCC revs
    .studio/plans/        # execute plan snapshots
    .studio/rules.json    # Project Rule items
"""

from __future__ import annotations

from ._ops import (
    conversation_get_summary,
    workspace_card,
    workspace_grep,
    workspace_list,
    workspace_read,
)
from ._session import CONFLICT_HINT, DOCS_PREFIX_NOTE, DocsSession
from ._store import (
    DEFAULT_PLAN_TITLE,
    DocsWriteConflict,
    ensure_seeded,
    has_docs_prefix,
    list_files,
    list_plan_snapshots,
    load_revs,
    load_workspace,
    normalize_rel_path,
    plan_title_from_markdown,
    project_docs_dir,
    project_studio_dir,
    read_file,
    read_plan_snapshot,
    wipe,
    workspace_snapshot,
    write_files,
    write_plan_snapshot,
)


def load_project_workspace(project_id: str) -> dict:
    """Load Markdown workspace snapshot ``{files, revs}``."""
    ensure_seeded(project_id)
    return workspace_snapshot(project_id)


__all__ = [
    "CONFLICT_HINT",
    "DEFAULT_PLAN_TITLE",
    "DOCS_PREFIX_NOTE",
    "DocsSession",
    "DocsWriteConflict",
    "conversation_get_summary",
    "ensure_seeded",
    "has_docs_prefix",
    "list_files",
    "list_plan_snapshots",
    "load_project_workspace",
    "load_revs",
    "load_workspace",
    "normalize_rel_path",
    "plan_title_from_markdown",
    "project_docs_dir",
    "project_studio_dir",
    "read_file",
    "read_plan_snapshot",
    "wipe",
    "workspace_card",
    "workspace_grep",
    "workspace_list",
    "workspace_read",
    "workspace_snapshot",
    "write_files",
    "write_plan_snapshot",
]
