"""Project plan_markdown into the list of design points still to settle.

Markdown stays the source (docs/protocol/04-plan-progress.md). The Plan prompt
puts one Markdown task-list item per open design question under「待敲定的设计点」
and nowhere else, so those items are the projection: checked → settled,
first unchecked → the one being discussed, rest pending.

This measures how much of the design has been pinned down, not how much of the
plan has been built. A plan with no task list projects to nothing rather than
falling back to section headings, which are document structure, not questions.

Same markdown always projects to the same ids and titles.
"""

from __future__ import annotations

import re
from typing import Any, Literal

PlanStepStatus = Literal["pending", "active", "done"]

_TASK_ITEM = re.compile(r"^[-*]\s+\[( |x|X)\]\s+(.+?)\s*$")


def _step_id(title: str, index: int) -> str:
    slug = re.sub(r"[^\w\u4e00-\u9fff]+", "-", title.lower()).strip("-")
    return slug or f"step-{index + 1}"


def _dedupe_id(sid: str, seen: set[str], index: int) -> str:
    if sid in seen:
        sid = f"{sid}-{index + 1}"
    seen.add(sid)
    return sid


def plan_progress_from_markdown(markdown: str) -> dict[str, Any]:
    """Stable projection of the plan's open design points."""
    steps: list[dict[str, Any]] = []
    seen: set[str] = set()
    for line in (markdown or "").splitlines():
        match = _TASK_ITEM.match(line.strip())
        if not match:
            continue
        title = match.group(2).strip()
        if not title:
            continue
        sid = _dedupe_id(_step_id(title, len(steps)), seen, len(steps))
        done = match.group(1).lower() == "x"
        steps.append({"id": sid, "title": title, "status": "done" if done else "pending"})
    for step in steps:
        if step["status"] == "pending":
            step["status"] = "active"
            break
    return {"steps": steps}
