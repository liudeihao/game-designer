"""Per-model context window: ModelSpec, presets, and resolve()."""

from app.api.schemas import ProviderBody
from app.config import LLMConfig, ModelSpec, _merge_providers
from app.memory import tokens


def test_model_spec_accepts_bare_string():
    spec = ModelSpec.model_validate("deepseek-v4-pro")
    assert spec.id == "deepseek-v4-pro"
    assert spec.context_window == 0
    assert spec.max_output_tokens == 0


def test_legacy_string_models_parse_on_provider():
    cfg = LLMConfig.model_validate(
        {
            "providers": [
                {
                    "id": "p1",
                    "label": "DeepSeek",
                    "base_url": "https://api.deepseek.com",
                    "api_key": "sk-test",
                    "models": ["deepseek-v4-pro", "deepseek-v4-flash"],
                }
            ],
            "active_provider_id": "p1",
            "model": "deepseek-v4-pro",
        }
    )
    assert cfg.providers[0].cleaned_models() == ["deepseek-v4-pro", "deepseek-v4-flash"]
    endpoint = cfg.resolve()
    assert endpoint is not None
    assert endpoint.model == "deepseek-v4-pro"
    assert endpoint.context_window == 1_000_000
    assert endpoint.max_output_tokens == 384_000


def test_explicit_spec_overrides_preset(monkeypatch):
    cfg = LLMConfig.model_validate(
        {
            "providers": [
                {
                    "id": "p1",
                    "label": "DeepSeek",
                    "base_url": "https://api.deepseek.com",
                    "api_key": "sk-test",
                    "models": [{"id": "deepseek-v4-pro", "context_window": 32_000, "max_output_tokens": 1_024}],
                }
            ],
            "active_provider_id": "p1",
            "model": "deepseek-v4-pro",
        }
    )
    monkeypatch.setattr(tokens, "get_config", lambda: type("C", (), {"llm": cfg})())
    assert tokens.resolve_context_limit("deepseek-v4-pro", provider_id="p1") == 32_000
    expected = max(512, int((32_000 - 1_024) * 0.75))
    assert tokens.token_budget(model="deepseek-v4-pro", provider_id="p1") == expected


def test_same_model_name_uses_provider_id(monkeypatch):
    cfg = LLMConfig.model_validate(
        {
            "providers": [
                {
                    "id": "direct",
                    "label": "Kimi",
                    "base_url": "https://api.moonshot.cn",
                    "api_key": "sk-a",
                    "models": [{"id": "kimi-k2", "context_window": 256_000}],
                },
                {
                    "id": "relay",
                    "label": "中转",
                    "base_url": "https://relay.example.com",
                    "api_key": "sk-b",
                    "models": [{"id": "kimi-k2", "context_window": 128_000}],
                },
            ],
            "active_provider_id": "direct",
            "model": "kimi-k2",
        }
    )
    monkeypatch.setattr(tokens, "get_config", lambda: type("C", (), {"llm": cfg})())
    assert tokens.resolve_context_limit("kimi-k2", provider_id="direct") == 256_000
    assert tokens.resolve_context_limit("kimi-k2", provider_id="relay") == 128_000
    # Bare name falls through to the first provider that lists it.
    assert tokens.resolve_context_limit("kimi-k2") == 256_000


def test_legacy_global_context_window_migrates_to_active_model():
    cfg = LLMConfig.model_validate(
        {
            "providers": [
                {
                    "id": "p1",
                    "label": "DeepSeek",
                    "base_url": "https://api.deepseek.com",
                    "api_key": "sk-test",
                    "models": ["deepseek-v4-pro"],
                }
            ],
            "active_provider_id": "p1",
            "model": "deepseek-v4-pro",
            "context_window": 64_000,
        }
    )
    migrated = cfg.migrate_legacy()
    assert migrated.context_window == 0
    spec = migrated.providers[0].find_spec("deepseek-v4-pro")
    assert spec is not None
    assert spec.context_window == 64_000
    assert migrated.resolve().context_window == 64_000


def test_merge_providers_fills_preset_when_unset():
    merged = _merge_providers(
        [],
        [
            {
                "id": "p1",
                "label": "DeepSeek",
                "base_url": "https://api.deepseek.com",
                "api_key": "sk-test",
                "models": ["deepseek-v4-pro"],
            }
        ],
    )
    spec = merged[0].find_spec("deepseek-v4-pro")
    assert spec is not None
    assert spec.context_window == 1_000_000
    assert spec.max_output_tokens == 384_000


def test_provider_body_accepts_mixed_model_items():
    body = ProviderBody.model_validate(
        {
            "label": "x",
            "base_url": "https://example.com",
            "models": ["plain-id", {"id": "object-id", "context_window": 16_000}],
        }
    )
    assert [m.id for m in body.models] == ["plain-id", "object-id"]
    assert body.models[1].context_window == 16_000


def test_token_budget_uses_default_reserve_for_unknown_model(monkeypatch):
    cfg = LLMConfig()
    monkeypatch.setattr(tokens, "get_config", lambda: type("C", (), {"llm": cfg})())
    expected = max(512, int((128_000 - 4_096) * 0.75))
    assert tokens.token_budget(model="totally-unknown-7b") == expected
