"""Context usage prefers the latest LLM call's input_tokens."""

import asyncio

from app.memory.context_usage import context_usage_from_call, estimate_context_usage
from app.rules import write_user_rules


def test_context_usage_from_call_uses_provider_input_tokens():
    payload = context_usage_from_call(
        {
            "id": "usage_abc",
            "model": "gpt-test",
            "role": "main_agent",
            "input_tokens": 1200,
            "usage_source": "provider",
            "input_breakdown": {
                "system": 200,
                "rules": 80,
                "tools": 400,
                "conversation": 520,
                "other": 0,
            },
        },
        mode="",
        model="gpt-test",
    )

    assert payload is not None
    assert payload["total_tokens"] == 1200
    assert payload["source"] == "provider"
    assert payload["call_id"] == "usage_abc"
    assert sum(c["tokens"] for c in payload["categories"]) == 1200
    by_id = {c["id"]: c["tokens"] for c in payload["categories"]}
    assert by_id["system"] == 200
    assert by_id["rules"] == 80
    assert by_id["tools"] == 400
    assert by_id["conversation"] == 520


def test_context_usage_from_call_fills_other_when_breakdown_short():
    payload = context_usage_from_call(
        {
            "input_tokens": 100,
            "usage_source": "estimated",
            "input_breakdown": {"system": 10, "tools": 0, "conversation": 20, "other": 0},
            "model": "x",
        },
        mode="ask",
    )

    assert payload is not None
    assert payload["total_tokens"] == 100
    assert payload["source"] == "estimated"
    assert payload["mode"] == "ask"
    assert sum(c["tokens"] for c in payload["categories"]) == 100
    by_id = {c["id"]: c["tokens"] for c in payload["categories"]}
    assert by_id["other"] == 70
    assert by_id["rules"] == 0


def test_context_usage_from_call_ignores_empty_input():
    assert (
        context_usage_from_call(
            {"input_tokens": 0, "usage_source": "provider", "input_breakdown": {}},
            mode="",
        )
        is None
    )


def test_estimate_context_usage_includes_rules(data_dir):
    write_user_rules([{"name": "先问再写", "details": "动手前先对齐范围。"}])
    payload = asyncio.run(estimate_context_usage(messages=[], workspace_value={}, mode=""))
    by_id = {c["id"]: c for c in payload["categories"]}
    assert "rules" in by_id
    assert by_id["rules"]["tokens"] > 0
    assert by_id["rules"]["label"] == "Rules"
    assert payload["source"] == "projected"

