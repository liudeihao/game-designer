"""tools_for(mode) is the only agent tool assembly point."""

from __future__ import annotations

import pytest
from langgraph.types import Command

from app.agent.context import AgentContext
from app.agent.tools.deps import normalize_mode
from app.agent.tools import tools_for
from app.agent.tools.inject import fake_tool_runtime
from app.agent.tools.plan_panel import (
    ASK_USER_TOOL,
    UPDATE_PLAN_TOOL,
    WRITE_PLAN_TOOL,
)
from app.agent.tools.mode import SUGGEST_MODE_TOOL
from app.rules import PROPOSE_RULE_TOOL
from app.docs import load_workspace


def _names(
    mode: str,
    *,
    plan_exists: bool = False,
    policy: str = "for_mode",
    trigger: str = "",
) -> set[str]:
    return {
        getattr(t, "name", "")
        for t in tools_for(
            mode,
            trigger=trigger,
            plan_exists=plan_exists,
            policy=policy,  # type: ignore[arg-type]
        )
    }


def _schema_props(tool) -> set[str]:
    schema = tool.args_schema
    if schema is None:
        return set()
    if hasattr(schema, "model_json_schema"):
        return set((schema.model_json_schema().get("properties") or {}).keys())
    if isinstance(schema, dict):
        return set((schema.get("properties") or {}).keys())
    return set()


def test_normalize_mode_only_plan_and_ask() -> None:
    assert normalize_mode("ask") == "ask"
    assert normalize_mode("plan") == "plan"
    assert normalize_mode("") == ""
    assert normalize_mode(None) == ""
    assert normalize_mode("nope") == ""


def test_plan_profile_is_read_plus_plan_tools() -> None:
    names = _names("plan", plan_exists=False)
    assert "workspace_list" in names
    assert "workspace_read" in names
    assert "workspace_write" not in names
    assert "workspace_search_replace" not in names
    assert "workspace_delete" not in names
    assert ASK_USER_TOOL in names
    assert WRITE_PLAN_TOOL in names
    assert UPDATE_PLAN_TOOL not in names
    assert SUGGEST_MODE_TOOL not in names
    assert PROPOSE_RULE_TOOL in names


def test_plan_profile_uses_update_when_plan_exists() -> None:
    names = _names("plan", plan_exists=True)
    assert UPDATE_PLAN_TOOL in names
    assert WRITE_PLAN_TOOL not in names


def test_agent_profile_is_read_write_plus_suggest_mode() -> None:
    names = _names("")
    assert "workspace_write" in names
    assert "workspace_search_replace" in names
    assert "workspace_delete" in names
    assert SUGGEST_MODE_TOOL in names
    assert PROPOSE_RULE_TOOL in names
    assert WRITE_PLAN_TOOL not in names
    assert ASK_USER_TOOL in names


def test_ask_profile_is_read_only() -> None:
    names = _names("ask")
    assert "workspace_read" in names
    assert "workspace_write" not in names
    assert "workspace_delete" not in names
    assert SUGGEST_MODE_TOOL in names
    assert WRITE_PLAN_TOOL not in names
    assert ASK_USER_TOOL not in names
    assert PROPOSE_RULE_TOOL in names


def test_execute_plan_omits_propose_rule_and_ask_user() -> None:
    names = _names("", trigger="execute_plan")
    assert PROPOSE_RULE_TOOL not in names
    assert ASK_USER_TOOL not in names
    assert SUGGEST_MODE_TOOL not in names
    assert "workspace_write" in names


def test_model_schema_hides_runtime_and_workspace_id() -> None:
    for tool in tools_for(""):
        props = _schema_props(tool)
        assert "runtime" not in props
        assert "workspace_id" not in props
        assert "root_dir" not in props


@pytest.mark.asyncio
async def test_all_tools_policy_binds_writes_in_ask_but_middleware_denies() -> None:
    names = _names("ask", policy="all")
    assert "workspace_write" in names
    tools = tools_for("ask", policy="all")
    write = next(t for t in tools if getattr(t, "name", "") == "workspace_write")
    runtime = fake_tool_runtime(
        context=AgentContext(workspace_id="proj_ask_deny", mode="ask", writable=False)
    )
    result = write.func(
        files=[{"path": "notes.md", "content": "# x\n"}],
        runtime=runtime,
    )
    text = str((result.update or {}).get("messages")[0].content)
    assert isinstance(result, Command)
    assert "ask" in text
    assert "不要重试" in text
    assert "notes.md" not in load_workspace("proj_ask_deny")
