"""Per-turn catalog view. Implementations are static tools; visibility is a policy."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

# Mode is Plan or Ask. Unset (NORMAL) is Agent at rest — not a third mode.
NORMAL = ""
PLAN = "plan"
ASK = "ask"
AgentMode = Literal["plan", "ask", ""]
ToolPolicy = Literal["for_mode", "all"]


@dataclass(frozen=True)
class CatalogView:
    mode: AgentMode = NORMAL
    trigger: str = ""
    plan_exists: bool = False


def normalize_mode(mode: str | None) -> AgentMode:
    """plan | ask | '' (anything else is unset)."""
    key = (mode or "").strip()
    if key in ("plan", "ask"):
        return key  # type: ignore[return-value]
    return NORMAL
