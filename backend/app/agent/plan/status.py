"""Lifecycle of a plan artifact.

A conversation holds at most one plan at a time. ``drafting`` and ``ready``
describe a plan still being written; ``executed`` means it was built and
archived under ``.studio/plans/``, so entering Plan again starts a new one.
"""

from __future__ import annotations

PLAN_DRAFTING = "drafting"
PLAN_READY = "ready"
PLAN_EXECUTED = "executed"


def plan_to_resume(
    plan_markdown: str,
    plan_title: str,
    plan_status: str,
) -> tuple[str, str]:
    """What entering Plan mode starts from, as ``(markdown, title)``.

    An unexecuted draft is resumed so the user can keep refining it. A plan that
    was already built is finished work, so this returns empty and the round
    starts a new plan.
    """
    if plan_status == PLAN_EXECUTED:
        return "", ""
    return (plan_markdown or "").strip(), (plan_title or "").strip()
