from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.usage.tags import (
    TAG_ASK,
    TAG_COMPACT,
    TAG_MUTATION,
    TAG_PLAN,
    TAG_UTILITY,
    call_tags,
    tools_invoked,
    tools_offered,
)
from app.usage.tracker import UsageCallbackHandler


def test_call_tags_plan_and_ask():
    assert call_tags(mode="plan") == [TAG_PLAN]
    assert call_tags(mode="ask") == [TAG_ASK]
    assert call_tags(mode="") == []


def test_call_tags_compact_implies_utility():
    assert call_tags(role="compaction") == [TAG_COMPACT, TAG_UTILITY]
    assert call_tags(raw_tags=["role:compaction"]) == [TAG_COMPACT, TAG_UTILITY]


def test_call_tags_no_first():
    assert "first_in_turn" not in call_tags(mode="plan", raw_tags=["first_in_turn"])


def test_tools_offered_have_no_mutation_tag():
    offered = tools_offered(
        [
            {"type": "function", "function": {"name": "workspace_write"}},
            {"name": "workspace_read"},
        ]
    )
    assert offered == [
        {"name": "workspace_write", "tags": []},
        {"name": "workspace_read", "tags": []},
    ]


def test_tools_invoked_mutation_only_on_writes():
    invoked = tools_invoked(
        [
            {"name": "workspace_write", "args": {}},
            {"name": "workspace_read", "args": {}},
            {"name": "workspace_search_replace", "args": {}},
            {"name": "workspace_delete", "args": {}},
        ]
    )
    by_name = {item["name"]: item["tags"] for item in invoked}
    assert by_name["workspace_write"] == [TAG_MUTATION]
    assert by_name["workspace_read"] == []
    assert by_name["workspace_search_replace"] == [TAG_MUTATION]
    assert by_name["workspace_delete"] == [TAG_MUTATION]


def test_handler_records_without_raising():
    handler = UsageCallbackHandler(
        project_id="p",
        conversation_id="c",
        turn_id="turn_1",
        default_model="m",
        mode="plan",
    )
    handler.start_turn()
    run_id = __import__("uuid").uuid4()
    handler.on_chat_model_start(
        {},
        [[SystemMessage(content="s"), HumanMessage(content="hi")]],
        run_id=run_id,
        invocation_params={
            "tools": [{"type": "function", "function": {"name": "workspace_write"}}],
        },
        tags=["role:compaction"],
    )
    handler.on_chat_model_end(
        AIMessage(
            content="ok",
            tool_calls=[{"name": "workspace_write", "args": {}, "id": "1"}],
            usage_metadata={"input_tokens": 10, "output_tokens": 2, "total_tokens": 12},
        ),
        run_id=run_id,
        tags=["role:compaction"],
        metadata={"role": "compaction"},
    )
    handler.end_turn()
    assert handler.turn_calls == 1


def test_insert_usage_persists_tags_and_tools(tmp_path, monkeypatch):
    from app.store import db

    monkeypatch.setattr(db, "_DB_PATH", tmp_path / "registry.sqlite")
    monkeypatch.setattr(db, "_conn", None)
    db.init_db()
    db.insert_usage(
        project_id="p1",
        conversation_id="c1",
        turn_id="t1",
        model="m",
        role="compaction",
        input_tokens=10,
        output_tokens=2,
        tags=["compact", "utility"],
        tools_offered=[{"name": "workspace_write", "tags": []}],
        tools_invoked=[{"name": "workspace_write", "tags": ["mutation"]}],
    )
    recent = db.usage_analytics()["recent"][0]
    assert recent["tags"] == ["compact", "utility"]
    assert recent["tools_offered"][0]["name"] == "workspace_write"
    assert recent["tools_offered"][0]["tags"] == []
    assert recent["tools_invoked"][0]["tags"] == ["mutation"]
    monkeypatch.setattr(db, "_conn", None)
