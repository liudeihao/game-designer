"""Independent image provider config: merge keys, resolve, not mixed with LLM."""

from app.config import ImageConfig, ImageProvider, _merge_image_providers
from app.image.client import ImageNotConfiguredError, generate_image_bytes


def test_image_spec_accepts_bare_string():
    cfg = ImageConfig.model_validate(
        {
            "providers": [
                {
                    "id": "p1",
                    "label": "OpenAI",
                    "base_url": "https://api.openai.com/v1",
                    "api_key": "sk-test",
                    "models": ["gpt-image-1", "dall-e-3"],
                }
            ],
            "active_provider_id": "p1",
            "model": "gpt-image-1",
        }
    )
    assert cfg.providers[0].cleaned_models() == ["gpt-image-1", "dall-e-3"]
    endpoint = cfg.resolve()
    assert endpoint is not None
    assert endpoint.model == "gpt-image-1"
    assert endpoint.api_key == "sk-test"
    assert cfg.is_configured


def test_image_resolve_requires_key_and_model():
    cfg = ImageConfig.model_validate(
        {
            "providers": [
                {
                    "id": "p1",
                    "label": "OpenAI",
                    "base_url": "https://api.openai.com/v1",
                    "api_key": "",
                    "models": ["gpt-image-1"],
                }
            ],
            "active_provider_id": "p1",
            "model": "gpt-image-1",
        }
    )
    assert cfg.resolve() is None
    assert not cfg.is_configured


def test_merge_image_providers_keeps_empty_key():
    existing = [
        ImageProvider(
            id="p1",
            label="OpenAI",
            base_url="https://api.openai.com/v1",
            api_key="sk-secret",
            models=["gpt-image-1"],
        )
    ]
    merged = _merge_image_providers(
        existing,
        [
            {
                "id": "p1",
                "label": "OpenAI",
                "base_url": "https://api.openai.com/v1",
                "api_key": "",
                "models": ["gpt-image-1"],
            }
        ],
    )
    assert merged[0].api_key == "sk-secret"


def test_generate_without_config_raises(monkeypatch):
    import app.image.client as image_client

    class _Cfg:
        image = ImageConfig()

    monkeypatch.setattr(image_client, "get_config", lambda: _Cfg())
    try:
        generate_image_bytes("a castle")
        assert False, "expected ImageNotConfiguredError"
    except ImageNotConfiguredError:
        pass
