"""Plan-mode compaction against the shared turn context."""

from __future__ import annotations

from typing import Any

from app.agent.runtime import extra_suffix_for, prepare_turn_context, resolve_profile
from app.docs import DocsSession
from app.state import AgentState


async def compact_plan_state(state: AgentState, *, trigger: str = "manual") -> dict[str, Any]:
    """Force a standalone Plan compaction and return its checkpoint update."""
    profile = resolve_profile(state)
    session = DocsSession(str(state.get("project_id") or ""), writable=False)
    _, memory, _ = await prepare_turn_context(
        state,
        profile,
        extra_suffix=extra_suffix_for(state, profile, session),
        force_compact=True,
        compact_trigger=trigger,
        compact_phase="standalone",
    )
    return memory
