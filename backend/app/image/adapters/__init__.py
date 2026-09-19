"""Registry of image-generation adapters.

To add a vendor: implement ``ImageAdapter`` and call ``register``.
Selection is ``ImageProvider.adapter`` (empty / ``auto`` infers from URL).
"""

from __future__ import annotations

from urllib.parse import urlparse

from app.config import ImageResolvedEndpoint
from app.image.adapters.base import AdapterInfo, ImageAdapter
from app.image.adapters.fal import FalAdapter
from app.image.adapters.openai_compat import OpenAIImagesAdapter

_REGISTRY: dict[str, ImageAdapter] = {}
_DEFAULT = "openai"
_AUTO = frozenset({"", "auto"})


def register(adapter: ImageAdapter) -> None:
    _REGISTRY[adapter.info.id] = adapter


register(OpenAIImagesAdapter())
register(FalAdapter())


def list_adapter_infos() -> list[dict[str, str]]:
    return [
        {
            "id": item.info.id,
            "label": item.info.label,
            "base_url_hint": item.info.base_url_hint,
            "model_hint": item.info.model_hint,
            "auth_hint": item.info.auth_hint,
        }
        for item in _REGISTRY.values()
    ]


def infer_adapter_id(base_url: str, explicit: str = "") -> str:
    kind = (explicit or "").strip().lower()
    if kind not in _AUTO:
        if kind not in _REGISTRY:
            raise RuntimeError(f"未知生图适配器: {kind}")
        return kind
    host = (urlparse(base_url or "").hostname or "").lower()
    if "fal.ai" in host or "fal.run" in host:
        return "fal"
    return _DEFAULT


def get_adapter(endpoint: ImageResolvedEndpoint) -> ImageAdapter:
    adapter_id = infer_adapter_id(endpoint.base_url, endpoint.adapter)
    return _REGISTRY[adapter_id]


__all__ = [
    "AdapterInfo",
    "ImageAdapter",
    "get_adapter",
    "infer_adapter_id",
    "list_adapter_infos",
    "register",
]
