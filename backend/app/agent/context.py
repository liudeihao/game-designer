"""Run-scoped context injected into tools via ToolRuntime. Not checkpointed."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.agent.tools.deps import ASK, PLAN, normalize_mode


@dataclass(frozen=True)
class AgentContext:
    """Trusted per-run handles. The model cannot fill these."""

    workspace_id: str = ""
    mode: str = ""
    trigger: str = ""
    writable: bool = False
    require_read_before_write: bool = False


def context_from_state(state: dict[str, Any] | None) -> AgentContext:
    """Derive invoke context from checkpointed state (and optional program fields)."""
    raw = state if isinstance(state, dict) else {}
    mode = normalize_mode(raw.get("mode"))
    return AgentContext(
        workspace_id=str(raw.get("project_id") or ""),
        mode=mode,
        trigger=str(raw.get("trigger") or ""),
        writable=mode not in (PLAN, ASK),
        require_read_before_write=mode not in (PLAN, ASK),
    )
