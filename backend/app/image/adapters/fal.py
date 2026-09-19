"""fal.ai HTTP API (``fal.run`` / ``queue.fal.run``)."""

from __future__ import annotations

import time
from urllib.parse import urlparse

from app.config import ImageResolvedEndpoint
from app.image.adapters.base import AdapterInfo
from app.image.http import download_bytes, ext_from_url_or_type, request_json

_DEFAULT_BASE = "https://fal.run"
_POLL_INTERVAL_SEC = 2.0
_POLL_ATTEMPTS = 60


class FalAdapter:
    info = AdapterInfo(
        id="fal",
        label="fal.ai",
        base_url_hint=_DEFAULT_BASE,
        model_hint="fal-ai/flux/schnell",
        auth_hint="Authorization: Key …",
    )

    def generate(self, prompt: str, endpoint: ImageResolvedEndpoint) -> tuple[bytes, str]:
        base = (endpoint.base_url or "").strip() or _DEFAULT_BASE
        model = (endpoint.model or "").strip().lstrip("/")
        if not model:
            raise RuntimeError("fal.ai 需要填写模型 ID，例如 fal-ai/flux/schnell。")
        url = f"{base.rstrip('/')}/{model}"
        headers = {"Authorization": _fal_auth(endpoint.api_key)}
        data = request_json("POST", url, payload={"prompt": prompt}, headers=headers)
        found = _extract_image(data)
        if found is not None:
            return found
        request_id = str(data.get("request_id") or "").strip()
        if request_id:
            return _poll_queue(base, model, request_id, headers)
        raise RuntimeError("fal.ai 没有返回图片。")


def _fal_auth(api_key: str) -> str:
    key = (api_key or "").strip()
    if key.lower().startswith("key "):
        return key
    return f"Key {key}"


def _queue_root(base: str) -> str:
    parsed = urlparse(base)
    host = (parsed.hostname or "").lower()
    scheme = parsed.scheme or "https"
    if host == "fal.run" or host.endswith(".fal.run"):
        return f"{scheme}://queue.fal.run"
    return base.rstrip("/")


def _poll_queue(
    base: str,
    model: str,
    request_id: str,
    headers: dict[str, str],
) -> tuple[bytes, str]:
    root = _queue_root(base)
    status_url = f"{root}/{model}/requests/{request_id}/status"
    result_url = f"{root}/{model}/requests/{request_id}"
    for _ in range(_POLL_ATTEMPTS):
        payload = request_json("GET", status_url, headers=headers)
        status = str(payload.get("status") or "").upper()
        found = _extract_image(payload)
        if found is not None:
            return found
        if status in {"FAILED", "CANCELLED", "ERROR"}:
            detail = payload.get("error") or payload.get("message") or status
            raise RuntimeError(f"fal.ai 队列失败: {detail}")
        if status in {"COMPLETED", "OK"}:
            result = request_json("GET", result_url, headers=headers)
            found = _extract_image(result)
            if found is not None:
                return found
            raise RuntimeError("fal.ai 队列完成但没有图片。")
        time.sleep(_POLL_INTERVAL_SEC)
    raise RuntimeError("fal.ai 排队超时。")


def _extract_image(data: dict) -> tuple[bytes, str] | None:
    rows = _image_rows(data)
    if not rows:
        return None
    first = rows[0]
    if isinstance(first, str) and first.strip():
        return download_bytes(first.strip()), ext_from_url_or_type(first)
    if not isinstance(first, dict):
        return None
    remote = str(first.get("url") or first.get("file_url") or "").strip()
    content_type = str(first.get("content_type") or "")
    if remote:
        return download_bytes(remote), ext_from_url_or_type(remote, content_type)
    return None


def _image_rows(data: dict) -> list:
    for key in ("images", "image"):
        value = data.get(key)
        if isinstance(value, list) and value:
            return value
        if isinstance(value, str) and value.strip():
            return [value]
        if isinstance(value, dict):
            return [value]
    nested = data.get("output")
    if isinstance(nested, dict):
        return _image_rows(nested)
    return []
