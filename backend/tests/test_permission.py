from unittest.mock import MagicMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from app.agent.loop import run_tool_batch
from app.agent.tools.permission import (
    decide_permissions,
    is_workspace_mutation,
    normalize_permission_answers,
    resolve_permissions,
    result_outcome,
)


def test_unknown_tool_name_is_not_a_workspace_mutation() -> None:
    assert not is_workspace_mutation(
        {"id": "m1", "name": "unknown_search", "args": {"q": "docs"}}
    )
    assert not is_workspace_mutation(
        {"id": "r1", "name": "workspace_read", "args": {"path": "docs/a.md"}}
    )
    assert not is_workspace_mutation(
        {"id": "l1", "name": "workspace_list", "args": {}}
    )


def test_write_delete_replace_calls_are_mutations() -> None:
    assert is_workspace_mutation(
        {
            "id": "w1",
            "name": "workspace_write",
            "args": {"files": [{"path": "docs/a.md", "content": "# hi"}]},
        }
    )
    assert is_workspace_mutation(
        {
            "id": "s1",
            "name": "workspace_search_replace",
            "args": {"path": "docs/a.md", "old": "a", "new": "b"},
        }
    )
    assert is_workspace_mutation(
        {"id": "d1", "name": "workspace_delete", "args": {"paths": ["docs/a.md"]}}
    )


def test_auto_accept_allows_mutations() -> None:
    """Product contract A: unanswered mutations execute."""
    calls = [
        {"id": "r1", "name": "workspace_read", "args": {"path": "a.md"}},
        {
            "id": "w1",
            "name": "workspace_write",
            "args": {"files": [{"path": "a.md", "content": "x"}]},
        },
    ]
    perms = resolve_permissions(calls)
    assert perms[0].mutation is False
    assert perms[0].execute is True
    assert perms[0].status is None
    assert perms[1].mutation is True
    assert perms[1].status == "accepted"
    assert perms[1].execute is True


def test_reject_and_comment_skip_execution() -> None:
    calls = [
        {
            "id": "w1",
            "name": "workspace_write",
            "args": {"files": [{"path": "a.md", "content": "x"}]},
        },
        {
            "id": "w2",
            "name": "workspace_write",
            "args": {"files": [{"path": "b.md", "content": "y"}]},
        },
    ]
    perms = resolve_permissions(
        calls,
        auto_accept=False,
        answers={
            "w1": {"action": "reject"},
            "w2": {"action": "comment", "comment": "先改世界观"},
        },
    )
    assert perms[0].execute is False
    assert perms[0].status == "rejected"
    skipped = perms[0].skipped_execution(calls[0])
    assert skipped["permission_outcome"] == "reject"
    assert result_outcome(skipped) == "reject"
    assert perms[1].status == "commented"
    commented = perms[1].skipped_execution(calls[1])
    assert "先改世界观" in str(commented["result"])
    assert result_outcome(commented) == "comment"


def test_without_auto_accept_unanswered_mutation_stays_pending() -> None:
    calls = [
        {
            "id": "w1",
            "name": "workspace_write",
            "args": {"files": [{"path": "a.md", "content": "x"}]},
        }
    ]
    perms = resolve_permissions(calls, auto_accept=False)
    assert perms[0].status == "pending"
    assert perms[0].execute is False


@pytest.mark.asyncio
async def test_tool_batch_executes_passed_permissions_without_emitting() -> None:
    events: list[dict] = []
    calls = [
        {
            "name": "workspace_write",
            "args": {"files": [{"path": "a.md", "content": "x"}]},
            "id": "w1",
            "type": "tool_call",
        }
    ]
    permissions = decide_permissions(calls, mode="plan")
    assert permissions[0].status == "accepted"
    assert permissions[0].execute is True

    async def _exec(run_calls, _tools):
        assert len(run_calls) == 1
        return [{"name": "workspace_write", "ok": True, "result": "ok", "call_id": "w1"}]

    await run_tool_batch(
        calls,
        [MagicMock()],
        execute_calls=_exec,
        trace_agent="Agent",
        trace_kind_for=None,
        messages=[HumanMessage(content="写一下")],
        events=events,
        permissions=permissions,
    )
    kinds = [e["type"] for e in events]
    assert "tool_permission" not in kinds
    assert any(e["type"] == "tool_result" and e["outcome"] == "success" for e in events)


def test_decide_permissions_auto_accepts_when_hitl_disabled() -> None:
    calls = [
        {
            "id": "w1",
            "name": "workspace_write",
            "args": {"files": [{"path": "a.md", "content": "x"}]},
        }
    ]
    plan = decide_permissions(calls, mode="plan")
    assert plan[0].status == "accepted"
    assert plan[0].execute is True
    execute = decide_permissions(calls, trigger="execute_plan")
    assert execute[0].status == "accepted"


def test_decide_permissions_pending_when_hitl_and_no_answers(monkeypatch) -> None:
    from app.agent.tools import permission as perm

    monkeypatch.setattr(perm, "HITL_INTERRUPTS", True)
    calls = [
        {
            "id": "w1",
            "name": "workspace_write",
            "args": {"files": [{"path": "a.md", "content": "x"}]},
        }
    ]
    perms = decide_permissions(calls, mode="")
    assert perms[0].status == "pending"
    assert perms[0].execute is False


def test_normalize_permission_answers_defaults_missing_to_reject() -> None:
    mutations = [{"id": "w1", "name": "workspace_write", "args": {}}]
    assert normalize_permission_answers(None, mutations) == {"w1": {"action": "reject"}}
    nested = normalize_permission_answers(
        {"answers": {"w1": {"action": "accept"}}}, mutations
    )
    assert nested["w1"]["action"] == "accept"
    invalid = normalize_permission_answers({"w1": {"action": "maybe"}}, mutations)
    assert invalid["w1"]["action"] == "reject"


def test_hitl_enabled_skips_plan_ask_and_execute_plan(monkeypatch) -> None:
    from app.agent.tools import permission as perm

    monkeypatch.setattr(perm, "HITL_INTERRUPTS", True)
    assert perm.hitl_enabled(mode="", trigger="") is True
    assert perm.hitl_enabled(mode="plan") is False
    assert perm.hitl_enabled(mode="ask") is False
    assert perm.hitl_enabled(mode="", trigger="execute_plan") is False


def test_hitl_kill_switch_disables_agent_interrupts(monkeypatch) -> None:
    from app.agent.tools import permission as perm

    monkeypatch.setattr(perm, "HITL_INTERRUPTS", False)
    assert perm.hitl_enabled(mode="", trigger="") is False
    perms = decide_permissions(
        [
            {
                "id": "w1",
                "name": "workspace_write",
                "args": {"files": [{"path": "a.md", "content": "x"}]},
            }
        ],
        mode="",
    )
    assert perms[0].status == "accepted"
    assert perms[0].execute is True


@pytest.mark.asyncio
async def test_graph_permission_accept_reject_comment_and_no_double_execute(
    data_dir, monkeypatch
) -> None:
    from app.agent.tools import permission as perm

    monkeypatch.setattr(perm, "HITL_INTERRUPTS", True)
    from langgraph.checkpoint.memory import MemorySaver
    from langgraph.errors import GraphInterrupt
    from langgraph.types import Command

    from app.graph import build_graph
    from app.docs import load_workspace
    from unittest.mock import patch

    writes: list[str] = []

    class _LLM:
        def __init__(self) -> None:
            self.round = 0

        def bind_tools(self, _tools):
            return self

        async def astream(self, _messages):
            self.round += 1
            if self.round == 1:
                yield AIMessage(
                    content="写两份文档。",
                    tool_calls=[
                        {
                            "name": "workspace_write",
                            "args": {"files": [{"path": "a.md", "content": "# A"}]},
                            "id": "w1",
                            "type": "tool_call",
                        },
                        {
                            "name": "workspace_write",
                            "args": {"files": [{"path": "b.md", "content": "# B"}]},
                            "id": "w2",
                            "type": "tool_call",
                        },
                    ],
                )
            else:
                yield AIMessage(content="好了。")

        async def ainvoke(self, messages):
            async for chunk in self.astream(messages):
                return chunk
            raise RuntimeError("empty")

    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "perm_hitl"}}
    program = {
        "project_id": "proj_perm",
        "mode": "",
        "instruction": "写文档",
        "messages": [HumanMessage(content="写文档")],
        "trigger": "",
    }

    original_write = None
    from app.docs import DocsSession

    real_write = DocsSession.write

    def counting_write(self, files, content=None):
        writes.append("write")
        return real_write(self, files, content)

    with patch("app.agent.runtime.get_llm", return_value=_LLM()), patch.object(
        DocsSession, "write", counting_write
    ):
        try:
            await graph.ainvoke(program, config)
        except GraphInterrupt:
            pass
        snap = await graph.aget_state(config)
        interrupts = [intr for task in (snap.tasks or []) for intr in (getattr(task, "interrupts", None) or [])]
        assert interrupts
        payload = interrupts[0].value
        assert payload["type"] == "tool_permission"
        assert {c["id"] for c in payload["calls"]} == {"w1", "w2"}
        assert writes == []

        try:
            await graph.ainvoke(
                Command(
                    resume={
                        "w1": {"action": "accept"},
                        "w2": {"action": "comment", "comment": "先改世界观"},
                    }
                ),
                config,
            )
        except GraphInterrupt:
            pass

    files = load_workspace("proj_perm")
    assert files["a.md"].startswith("# A")
    assert "b.md" not in files
    assert writes == ["write"]

    snap = await graph.aget_state(config)
    events = list(snap.values.get("events") or [])
    assert any(e.get("type") == "tool_permission" and e.get("id") == "w1" and e.get("status") == "accepted" for e in events)
    assert any(e.get("type") == "tool_permission" and e.get("id") == "w2" and e.get("status") == "commented" for e in events)
    assert any(e.get("type") == "tool_result" and e.get("id") == "w1" and e.get("outcome") == "success" for e in events)
    assert any(e.get("type") == "tool_result" and e.get("id") == "w2" and e.get("outcome") == "comment" for e in events)

