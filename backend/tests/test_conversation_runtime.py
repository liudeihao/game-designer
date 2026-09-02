"""Conversation checkpoint lifecycle and runtime projection."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from app.conversations.runtime import ConversationRuntime, ConversationSnapshot
from app.conversations.service import ConversationNotFound, ConversationService
from app.store import db


class _FakeCheckpointer:
    def __init__(self) -> None:
        self.deleted: list[str] = []
        self.fail: Exception | None = None

    async def adelete_thread(self, thread_id: str) -> None:
        if self.fail:
            raise self.fail
        self.deleted.append(thread_id)


class _FakeGraph:
    def __init__(self, snapshot: Any, checkpointer: _FakeCheckpointer | None = None) -> None:
        self._snapshot = snapshot
        self.checkpointer = checkpointer or _FakeCheckpointer()
        self.updated: list[tuple[dict, dict]] = []

    async def aget_state(self, config: dict) -> Any:
        return self._snapshot

    async def aupdate_state(self, config: dict, values: dict) -> None:
        self.updated.append((config, values))


def _registry(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(db, "_DB_PATH", tmp_path / "registry.sqlite")
    monkeypatch.setattr(db, "_conn", None)
    db.init_db()


def _snapshot(*, messages: list, pending: dict | None = None, **values: Any) -> SimpleNamespace:
    tasks = []
    if pending is not None:
        tasks = [SimpleNamespace(interrupts=[SimpleNamespace(value=pending)])]
    payload = {"messages": messages, **values}
    return SimpleNamespace(values=payload, tasks=tasks)


@pytest.mark.asyncio
async def test_load_hides_langgraph_snapshot_shape() -> None:
    raw = _snapshot(
        messages=[HumanMessage(content="hi"), AIMessage(content="ok")],
        pending={"type": "user_choice", "variant": "questions", "message": "还缺什么？"},
        plan_markdown="# Plan",
        conversation_summary="摘要",
        activity=[{"agent": "系统", "message": "开始"}],
    )
    view = await ConversationRuntime(_FakeGraph(raw)).load("conv_1")

    assert isinstance(view, ConversationSnapshot)
    assert [m.content for m in view.messages] == ["hi", "ok"]
    assert view.pending == {"type": "user_choice", "variant": "questions", "message": "还缺什么？"}
    assert view.plan_markdown == "# Plan"
    assert view.conversation_summary == "摘要"
    assert view.activity[0]["agent"] == "系统"
    ui = view.ui_messages()
    assert ui[-1]["content"] == "ok"
    assert view.pending == {"type": "user_choice", "variant": "questions", "message": "还缺什么？"}
    assert not (ui[-1].get("parts") or [])
    assert not hasattr(view, "values")
    assert not hasattr(view, "tasks")


def test_plan_questions_are_serialized_on_ai_message() -> None:
    view = ConversationSnapshot(
        conversation_id="c",
        agent_state={
            "messages": [
                HumanMessage(content="做个游戏"),
                AIMessage(
                    content="先确认一件事。",
                    additional_kwargs={
                        "plan_questions": [
                            {"id": "q1", "prompt": "偏什么节奏？", "options": [{"id": "a", "label": "休闲"}]}
                        ]
                    },
                ),
            ]
        },
        pending=None,
    )
    ui = view.ui_messages()
    assert ui[-1]["plan_questions"][0]["id"] == "q1"


@pytest.mark.asyncio
async def test_runtime_delete_removes_thread() -> None:
    graph = _FakeGraph(_snapshot(messages=[]))
    await ConversationRuntime(graph).delete("conv_gone")
    assert graph.checkpointer.deleted == ["conv_gone"]


@pytest.mark.asyncio
async def test_runtime_delete_treats_missing_tables_as_gone() -> None:
    graph = _FakeGraph(_snapshot(messages=[]))
    graph.checkpointer.fail = Exception("no such table: checkpoints")
    await ConversationRuntime(graph).delete("conv_empty")
    assert graph.checkpointer.deleted == []


@pytest.mark.asyncio
async def test_service_delete_drops_checkpoint_then_registry(tmp_path, monkeypatch) -> None:
    _registry(tmp_path, monkeypatch)
    project = db.create_project("测试")
    conv = db.create_conversation(project["id"], "一条对话")
    graph = _FakeGraph(_snapshot(messages=[HumanMessage(content="x")]))
    service = ConversationService(ConversationRuntime(graph))

    deleted = await service.delete(conv["id"])

    assert deleted == conv["id"]
    assert graph.checkpointer.deleted == [conv["id"]]
    assert db.get_conversation(conv["id"]) is None


@pytest.mark.asyncio
async def test_service_delete_keeps_registry_if_checkpoint_fails(tmp_path, monkeypatch) -> None:
    _registry(tmp_path, monkeypatch)
    project = db.create_project("测试")
    conv = db.create_conversation(project["id"], "一条对话")
    graph = _FakeGraph(_snapshot(messages=[]))
    graph.checkpointer.fail = RuntimeError("disk locked")
    service = ConversationService(ConversationRuntime(graph))

    with pytest.raises(RuntimeError, match="disk locked"):
        await service.delete(conv["id"])
    assert db.get_conversation(conv["id"]) is not None


@pytest.mark.asyncio
async def test_service_delete_missing_conversation(tmp_path, monkeypatch) -> None:
    _registry(tmp_path, monkeypatch)
    service = ConversationService(ConversationRuntime(_FakeGraph(_snapshot(messages=[]))))
    with pytest.raises(ConversationNotFound):
        await service.delete("conv_missing")


@pytest.mark.asyncio
async def test_delete_project_cleans_all_threads(tmp_path, monkeypatch) -> None:
    _registry(tmp_path, monkeypatch)
    project = db.create_project("测试")
    first = db.create_conversation(project["id"], "A")
    second = db.create_conversation(project["id"], "B")
    graph = _FakeGraph(_snapshot(messages=[]))
    service = ConversationService(ConversationRuntime(graph))

    await service.delete_project(project["id"])

    assert set(graph.checkpointer.deleted) == {first["id"], second["id"]}
    assert db.get_project(project["id"]) is None
    assert db.list_conversations(project["id"]) == []
