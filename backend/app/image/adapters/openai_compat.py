"""OpenAI Images API and compatible relays (``/images/generations``)."""

from __future__ import annotations

import base64

from app.config import ImageResolvedEndpoint
from app.image.adapters.base import AdapterInfo
from app.image.http import download_bytes, ext_from_url_or_type, request_json


class OpenAIImagesAdapter:
    info = AdapterInfo(
        id="openai",
        label="OpenAI 兼容",
        base_url_hint="https://api.openai.com/v1",
        model_hint="gpt-image-1",
        auth_hint="Bearer sk-…",
    )

    def generate(self, prompt: str, endpoint: ImageResolvedEndpoint) -> tuple[bytes, str]:
        url = _images_url(endpoint.base_url)
        headers = {
            "Authorization": f"Bearer {(endpoint.api_key or '').strip()}",
        }
        payload = {
            "model": endpoint.model,
            "prompt": prompt,
            "n": 1,
            "size": "1024x1024",
            "response_format": "b64_json",
        }
        try:
            data = request_json("POST", url, payload=payload, headers=headers)
        except RuntimeError as exc:
            if "response_format" in str(exc).lower() or "400" in str(exc):
                payload.pop("response_format", None)
                data = request_json("POST", url, payload=payload, headers=headers)
            else:
                raise

        rows = data.get("data")
        if not isinstance(rows, list) or not rows:
            raise RuntimeError("生图接口没有返回图片。")
        first = rows[0] if isinstance(rows[0], dict) else {}
        b64 = str(first.get("b64_json") or "").strip()
        if b64:
            try:
                return base64.b64decode(b64), "png"
            except Exception as exc:
                raise RuntimeError("生图接口返回的图片无法解码。") from exc
        remote = str(first.get("url") or "").strip()
        if remote:
            return download_bytes(remote), ext_from_url_or_type(remote)
        raise RuntimeError("生图接口既没有 b64_json 也没有 url。")


def _images_url(base_url: str) -> str:
    root = (base_url or "").strip().rstrip("/")
    if not root:
        raise RuntimeError("生图 Provider 缺少 Base URL。")
    return f"{root}/images/generations"
