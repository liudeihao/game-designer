"""A prompt may only name tools that mode actually binds.

Prompts and the tool registry are edited independently, so a prompt can end up
telling the Agent to use something that was never registered for its mode. The
model then burns a round on a catalog miss.
"""

from __future__ import annotations

from app.agent.plan.prompts import PLAN_SYSTEM_PROMPT
from app.agent.studio.prompts import ASK_AGENT_SYSTEM, MAIN_AGENT_SYSTEM
from app.agent.tools import tools_for
from app.agent.tools.plan_panel import (
    ASK_USER_TOOL,
    UPDATE_PLAN_TOOL,
    WRITE_PLAN_TOOL,
)
from app.agent.tools.mode import SUGGEST_MODE_TOOL
from app.agent.tools.schemas import (
    WORKSPACE_READ_TOOL_IDS,
    WORKSPACE_WRITE_TOOL_IDS,
)
from app.rules import PROPOSE_RULE_TOOL

KNOWN_TOOL_NAMES = {
    *(tool_id.replace(".", "_") for tool_id in WORKSPACE_READ_TOOL_IDS),
    *(tool_id.replace(".", "_") for tool_id in WORKSPACE_WRITE_TOOL_IDS),
    ASK_USER_TOOL,
    WRITE_PLAN_TOOL,
    UPDATE_PLAN_TOOL,
    SUGGEST_MODE_TOOL,
    PROPOSE_RULE_TOOL,
}


def _bound_names(mode: str, *, plan_exists: bool = False, trigger: str = "") -> set[str]:
    return {
        getattr(t, "name", "")
        for t in tools_for(mode, trigger=trigger, plan_exists=plan_exists)
    }


def _mentioned(text: str) -> set[str]:
    return {name for name in KNOWN_TOOL_NAMES if name in text}


def test_main_prompt_only_names_tools_bound_at_rest() -> None:
    bound = _bound_names("")
    assert _mentioned(MAIN_AGENT_SYSTEM) <= bound


def test_ask_prompt_only_names_tools_bound_in_ask() -> None:
    assert _mentioned(ASK_AGENT_SYSTEM) <= _bound_names("ask")


def test_plan_prompt_only_names_tools_bound_in_plan() -> None:
    fresh = _bound_names("plan", plan_exists=False)
    existing = _bound_names("plan", plan_exists=True)
    mentioned = _mentioned(PLAN_SYSTEM_PROMPT)
    assert mentioned <= (fresh | existing)


def test_contract_is_not_vacuous() -> None:
    assert _mentioned(MAIN_AGENT_SYSTEM)
    assert _mentioned(ASK_AGENT_SYSTEM)
    assert _mentioned(PLAN_SYSTEM_PROMPT)
