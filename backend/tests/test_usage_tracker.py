from langchain_core.messages import AIMessage, SystemMessage

from app.store import db
from app.usage.tracker import INPUT_CATEGORIES, UsageCallbackHandler, _add_message_tokens, _extract_usage, _reconcile_breakdown


def _handler(tmp_path, monkeypatch) -> UsageCallbackHandler:
    monkeypatch.setattr(db, "_DB_PATH", tmp_path / "registry.sqlite")
    monkeypatch.setattr(db, "_conn", None)
    return UsageCallbackHandler(
        project_id="proj_1",
        conversation_id="conv_1",
        turn_id="turn_1",
        default_model="test-model",
    )


def test_extracts_openai_cached_prompt_tokens():
    message = AIMessage(
        content="ok",
        usage_metadata={
            "input_tokens": 100,
            "output_tokens": 10,
            "total_tokens": 110,
            "input_token_details": {"cache_read": 80, "cache_write": 5},
        },
        response_metadata={"model_name": "gpt-5.6-sol"},
    )

    assert _extract_usage(message, None) == (100, 10, "gpt-5.6-sol", 80, 5)


def test_extracts_anthropic_cache_fields_from_provider_usage():
    message = AIMessage(
        content="ok",
        response_metadata={
            "usage": {
                "input_tokens": 100,
                "output_tokens": 10,
                "cache_read_input_tokens": 70,
                "cache_creation_input_tokens": 20,
            }
        },
    )

    assert _extract_usage(message, None) == (100, 10, "", 70, 20)


def test_input_breakdown_is_reconciled_to_provider_total():
    result = _reconcile_breakdown(
        {"system": 20, "tools": 30, "conversation": 50, "other": 0},
        123,
    )

    assert sum(result.values()) == 123
    assert result == {"system": 25, "rules": 0, "tools": 37, "conversation": 61, "other": 0}


def test_unknown_prompt_payload_becomes_other_input():
    assert _reconcile_breakdown({}, 17) == {
        "system": 0,
        "rules": 0,
        "tools": 0,
        "conversation": 0,
        "other": 17,
    }


def test_latest_context_call_reports_most_recent_record(tmp_path, monkeypatch):
    handler = _handler(tmp_path, monkeypatch)
    assert handler.latest_context_call() is None

    handler._record(
        run_id=None,
        model="model-a",
        role="main_agent",
        input_tokens=100,
        output_tokens=10,
        usage_source="provider",
        input_breakdown={"system": 40, "tools": 60},
    )
    handler._record(
        run_id=None,
        model="model-b",
        role="ask_agent",
        input_tokens=250,
        output_tokens=20,
        usage_source="estimated",
        input_breakdown={"conversation": 250},
    )

    call = handler.latest_context_call()
    assert call == {
        "model": "model-b",
        "role": "ask_agent",
        "input_tokens": 250,
        "usage_source": "estimated",
        "input_breakdown": {"conversation": 250},
    }
    # Context is per-call occupancy, not the turn total the meter aggregates.
    assert handler.turn_input_tokens == 350


def test_latest_context_call_ignores_empty_calls(tmp_path, monkeypatch):
    handler = _handler(tmp_path, monkeypatch)
    handler._record(
        run_id=None,
        model="model-a",
        role="main_agent",
        input_tokens=0,
        output_tokens=0,
        usage_source="provider",
        input_breakdown={},
    )

    assert handler.latest_context_call() is None


def test_latest_context_call_returns_a_copy(tmp_path, monkeypatch):
    handler = _handler(tmp_path, monkeypatch)
    handler._record(
        run_id=None,
        model="model-a",
        role="main_agent",
        input_tokens=100,
        output_tokens=10,
        usage_source="provider",
        input_breakdown={"system": 100},
    )

    handler.latest_context_call()["input_tokens"] = 999

    assert handler.latest_context_call()["input_tokens"] == 100


def test_system_message_peels_rule_sections_into_rules_category():
    breakdown = {key: 0 for key in INPUT_CATEGORIES}
    _add_message_tokens(
        breakdown,
        SystemMessage(content="BASE\n\n## User Rule\n### 先问再写\n动手前先对齐范围。"),
        "",
    )
    assert breakdown["system"] > 0
    assert breakdown["rules"] > 0
    assert breakdown["tools"] == 0


def test_system_message_without_rules_stays_in_system():
    breakdown = {key: 0 for key in INPUT_CATEGORIES}
    _add_message_tokens(breakdown, SystemMessage(content="只做设计文档。"), "")
    assert breakdown["system"] > 0
    assert breakdown["rules"] == 0
