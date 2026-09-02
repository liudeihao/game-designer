"""ConversationService facade: detail, execute-plan, resume, rule proposal."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.types import Command

from app.agent.plan.status import PLAN_EXECUTED, PLAN_READY
from app.conversations.errors import ConversationBadRequest, ConversationNotFound
from app.conversations.runtime import ConversationRuntime
from app.conversations.service import ConversationService
from app.store import db


class _FakeCheckpointer:
    async def adelete_thread(self, thread_id: str) -> None:
        del thread_id


class _FakeGraph:
    def __init__(self, snapshot: Any) -> None:
        self._snapshot = snapshot
        self.checkpointer = _FakeCheckpointer()
        self.updated: list[dict] = []

    async def aget_state(self, config: dict) -> Any:
        del config
        return self._snapshot

    async def aupdate_state(self, config: dict, values: dict) -> None:
        del config
        self.updated.append(values)
        payload = dict(self._snapshot.values)
        payload.update(values)
        self._snapshot = SimpleNamespace(values=payload, tasks=self._snapshot.tasks)


def _registry(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(db, "_DB_PATH", tmp_path / "registry.sqlite")
    monkeypatch.setattr(db, "_conn", None)
    db.init_db()
    import app.config as cfg

    monkeypatch.setattr(cfg, "data_dir", lambda: tmp_path)


def _snapshot(*, messages: list | None = None, pending: dict | None = None, **values: Any) -> SimpleNamespace:
    tasks = []
    if pending is not None:
        tasks = [SimpleNamespace(interrupts=[SimpleNamespace(value=pending)])]
    payload = {"messages": messages or [], **values}
    return SimpleNamespace(values=payload, tasks=tasks)


def _service(snapshot: SimpleNamespace) -> tuple[ConversationService, _FakeGraph]:
    graph = _FakeGraph(snapshot)
    return ConversationService(ConversationRuntime(graph)), graph


@pytest.mark.asyncio
async def test_get_detail_projects_registry_runtime_and_plan(tmp_path, monkeypatch) -> None:
    _registry(tmp_path, monkeypatch)
    project = db.create_project("测试")
    conv = db.create_conversation(project["id"], "一条对话", "plan")
    db.save_conversation_plan(conv["id"], "# 目标\n写愿景", "愿景")
    conv = db.get_conversation(conv["id"])
    service, _graph = _service(
        _snapshot(
            messages=[HumanMessage(content="hi"), AIMessage(content="ok")],
            plan_markdown="# 目标\n写愿景",
            plan_title="愿景",
            plan_status=PLAN_READY,
            activity=[{"agent": "系统", "message": "开始"}],
            events=[],
        )
    )

    detail = await service.get_detail(conv["id"])

    assert detail["conversation"]["id"] == conv["id"]
    assert detail["plan_markdown"].startswith("# 目标")
    assert detail["plan_title"] == "愿景"
    assert detail["plan_status"] == PLAN_READY
    assert detail["messages"][-1]["content"] == "ok"
    assert detail["activity"][0]["agent"] == "系统"
    assert "workspace" in detail
    assert "usage" in detail
    assert "plan_progress" in detail


@pytest.mark.asyncio
async def test_execute_plan_writes_snapshot_then_mode_then_runtime(tmp_path, monkeypatch) -> None:
    _registry(tmp_path, monkeypatch)
    project = db.create_project("测试")
    conv = db.create_conversation(project["id"], "一条对话", "plan")
    service, graph = _service(
        _snapshot(
            messages=[HumanMessage(content="写计划")],
            plan_markdown="# 目标\n写愿景",
            plan_title="愿景",
            plan_status=PLAN_READY,
        )
    )
    order: list[str] = []

    from app.docs import write_plan_snapshot as real_snapshot

    def _write(*args, **kwargs):
        order.append("snapshot")
        return real_snapshot(*args, **kwargs)

    real_mode = db.set_conversation_mode

    def _mode(*args, **kwargs):
        order.append("mode")
        return real_mode(*args, **kwargs)

    orig_update = graph.aupdate_state

    async def _update(config, values):
        order.append("runtime")
        return await orig_update(config, values)

    graph.aupdate_state = _update  # type: ignore[method-assign]
    monkeypatch.setattr("app.conversations._lifecycle.write_plan_snapshot", _write)
    monkeypatch.setattr(db, "set_conversation_mode", _mode)

    run = await service.execute_plan(conv["id"])

    assert order == ["snapshot", "mode", "runtime"]
    assert run.mode == ""
    assert run.start_activity == "按计划写入文档"
    assert run.program["trigger"] == "execute_plan"
    assert graph.updated[-1]["plan_status"] == PLAN_EXECUTED
    stored = db.get_conversation(conv["id"])
    from app.conversations.errors import conv_mode

    assert conv_mode(stored) == ""


@pytest.mark.asyncio
async def test_resume_defaults_for_permission_and_suggest_mode(tmp_path, monkeypatch) -> None:
    _registry(tmp_path, monkeypatch)
    project = db.create_project("测试")
    conv = db.create_conversation(project["id"], "一条对话")

    permission_pending = {
        "type": "tool_permission",
        "calls": [{"id": "w1", "name": "workspace_write"}, {"id": "w2"}],
    }
    service, _graph = _service(_snapshot(messages=[], pending=permission_pending))
    run = await service.resume(conv["id"], {})
    assert isinstance(run.program, Command)
    assert run.program.resume == {
        "w1": {"action": "reject"},
        "w2": {"action": "reject"},
    }

    suggest = {"type": "user_choice", "variant": "suggest_mode", "mode": "plan"}
    service, _graph = _service(_snapshot(messages=[], pending=suggest))
    run = await service.resume(conv["id"], {})
    assert run.program.resume == {"action": "dismiss"}

    questions = {
        "type": "user_choice",
        "variant": "questions",
        "questions": [{"id": "q1", "prompt": "哪边？"}],
    }
    service, _graph = _service(_snapshot(messages=[], pending=questions))
    with pytest.raises(ConversationBadRequest, match="answers required"):
        await service.resume(conv["id"], {})


@pytest.mark.asyncio
async def test_resolve_rule_proposal_accepts_and_ignores(tmp_path, monkeypatch) -> None:
    _registry(tmp_path, monkeypatch)
    project = db.create_project("测试")
    conv = db.create_conversation(project["id"], "一条对话")
    proposal = {
        "type": "rule_proposal",
        "id": "prop_1",
        "scope": "user",
        "operation": "add",
        "name": "语气",
        "details": "用中文",
        "status": "pending",
        "after_human": 1,
    }
    service, graph = _service(_snapshot(messages=[], events=[proposal]))

    accepted = await service.resolve_rule_proposal(
        conv["id"], "prop_1", action="accept"
    )
    assert accepted["ok"] is True
    assert accepted["event"]["status"] == "accepted"
    assert accepted["rule"] is not None
    assert graph.updated[-1]["events"][0]["status"] == "accepted"

    from app.rules import read_user_rules

    names = [item["name"] for item in read_user_rules()]
    assert "语气" in names

    ignored_proposal = {**proposal, "id": "prop_2"}
    service, graph = _service(_snapshot(messages=[], events=[ignored_proposal]))
    ignored = await service.resolve_rule_proposal(
        conv["id"], "prop_2", action="ignore"
    )
    assert ignored["event"]["status"] == "ignored"

    with pytest.raises(ConversationNotFound):
        await service.resolve_rule_proposal(conv["id"], "missing", action="ignore")
