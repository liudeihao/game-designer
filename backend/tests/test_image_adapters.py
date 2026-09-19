"""Image adapter registry: infer, OpenAI compat, fal HTTP."""

from __future__ import annotations

import base64

from app.config import ImageConfig, ImageProvider, ImageResolvedEndpoint, _merge_image_providers
from app.image.adapters import infer_adapter_id, list_adapter_infos
from app.image.adapters.fal import FalAdapter
from app.image.adapters.openai_compat import OpenAIImagesAdapter


class _Resp:
    def __init__(self, body: bytes | str):
        self._body = body if isinstance(body, bytes) else body.encode("utf-8")

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_adapter_catalog_includes_openai_and_fal():
    ids = {item["id"] for item in list_adapter_infos()}
    assert ids == {"openai", "fal"}


def test_infer_adapter_from_url_and_explicit():
    assert infer_adapter_id("https://api.openai.com/v1") == "openai"
    assert infer_adapter_id("https://fal.run") == "fal"
    assert infer_adapter_id("https://queue.fal.run") == "fal"
    assert infer_adapter_id("https://fal.ai") == "fal"
    assert infer_adapter_id("https://fal.run", "openai") == "openai"
    assert infer_adapter_id("https://api.openai.com/v1", "fal") == "fal"
    assert infer_adapter_id("https://fal.run", "auto") == "fal"
    try:
        infer_adapter_id("https://example.com", "midjourney")
        assert False, "expected unknown adapter"
    except RuntimeError as exc:
        assert "未知生图适配器" in str(exc)


def test_resolve_copies_adapter():
    cfg = ImageConfig.model_validate(
        {
            "providers": [
                {
                    "id": "p1",
                    "adapter": "fal",
                    "base_url": "https://fal.run",
                    "api_key": "key-1",
                    "models": ["fal-ai/flux/schnell"],
                }
            ],
            "active_provider_id": "p1",
            "model": "fal-ai/flux/schnell",
        }
    )
    endpoint = cfg.resolve()
    assert endpoint is not None
    assert endpoint.adapter == "fal"


def test_merge_keeps_adapter():
    existing = [
        ImageProvider(
            id="p1",
            adapter="fal",
            base_url="https://fal.run",
            api_key="secret",
            models=["fal-ai/flux/schnell"],
        )
    ]
    merged = _merge_image_providers(
        existing,
        [
            {
                "id": "p1",
                "adapter": "fal",
                "base_url": "https://fal.run",
                "api_key": "",
                "models": ["fal-ai/flux/schnell"],
            }
        ],
    )
    assert merged[0].adapter == "fal"
    assert merged[0].api_key == "secret"


def test_openai_adapter_reads_b64(monkeypatch):
    blob = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    b64 = base64.b64encode(blob).decode("ascii")
    seen: dict[str, str] = {}

    def fake_urlopen(req, timeout=None):
        seen["url"] = req.full_url
        seen["auth"] = req.get_header("Authorization")
        return _Resp(f'{{"data":[{{"b64_json":"{b64}"}}]}}')

    monkeypatch.setattr("app.image.http.urllib.request.urlopen", fake_urlopen)
    out, ext = OpenAIImagesAdapter().generate(
        "a castle",
        ImageResolvedEndpoint(
            provider_id="p1",
            adapter="openai",
            base_url="https://api.openai.com/v1",
            api_key="sk-test",
            model="gpt-image-1",
        ),
    )
    assert ext == "png"
    assert out == blob
    assert seen["url"] == "https://api.openai.com/v1/images/generations"
    assert seen["auth"] == "Bearer sk-test"


def test_fal_adapter_reads_images_url(monkeypatch):
    seen: list[tuple[str, str, str | None]] = []

    def fake_urlopen(req, timeout=None):
        auth = req.get_header("Authorization")
        seen.append((req.get_method(), req.full_url, auth))
        if req.get_method() == "POST":
            return _Resp('{"images":[{"url":"https://cdn.example/out.png","content_type":"image/png"}]}')
        if req.full_url == "https://cdn.example/out.png":
            return _Resp(b"FALPNG")
        raise AssertionError(req.full_url)

    monkeypatch.setattr("app.image.http.urllib.request.urlopen", fake_urlopen)
    out, ext = FalAdapter().generate(
        "a hero",
        ImageResolvedEndpoint(
            provider_id="p1",
            adapter="fal",
            base_url="https://fal.run",
            api_key="fal-secret",
            model="fal-ai/flux/schnell",
        ),
    )
    assert out == b"FALPNG"
    assert ext == "png"
    assert seen[0][0] == "POST"
    assert seen[0][1] == "https://fal.run/fal-ai/flux/schnell"
    assert seen[0][2] == "Key fal-secret"


def test_fal_adapter_polls_queue(monkeypatch):
    monkeypatch.setattr("app.image.adapters.fal.time.sleep", lambda _s: None)
    stage = {"n": 0}

    def fake_urlopen(req, timeout=None):
        url = req.full_url
        method = req.get_method()
        if method == "POST":
            return _Resp('{"request_id":"r1","status":"IN_QUEUE"}')
        if url.endswith("/status"):
            stage["n"] += 1
            if stage["n"] == 1:
                return _Resp('{"status":"IN_QUEUE"}')
            return _Resp('{"status":"COMPLETED"}')
        if url.endswith("/requests/r1"):
            return _Resp('{"images":[{"url":"https://cdn.example/q.png"}]}')
        if url == "https://cdn.example/q.png":
            return _Resp(b"QUEUEPNG")
        raise AssertionError(f"{method} {url}")

    monkeypatch.setattr("app.image.http.urllib.request.urlopen", fake_urlopen)
    out, ext = FalAdapter().generate(
        "queue me",
        ImageResolvedEndpoint(
            provider_id="p1",
            adapter="fal",
            base_url="https://fal.run",
            api_key="Key already-prefixed",
            model="fal-ai/flux/dev",
        ),
    )
    assert out == b"QUEUEPNG"
    assert ext == "png"
