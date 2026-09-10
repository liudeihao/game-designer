"""OpenAI-compatible image generation (BYOK, separate from text LLM)."""

from __future__ import annotations

import base64
import json
import urllib.error
import urllib.request
from typing import Any

from app.config import get_config


class ImageNotConfiguredError(RuntimeError):
    """Raised when no usable image provider is configured."""


def _images_url(base_url: str) -> str:
    root = (base_url or "").strip().rstrip("/")
    if not root:
        raise ImageNotConfiguredError("生图 Provider 缺少 Base URL。")
    return f"{root}/images/generations"


def _http_json(url: str, payload: dict[str, Any], api_key: str, *, timeout: float = 120.0) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        raise RuntimeError(f"生图接口失败 ({exc.code}): {detail or exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"无法连接生图接口: {exc.reason}") from exc
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("生图接口返回了无法解析的响应。") from exc
    if not isinstance(data, dict):
        raise RuntimeError("生图接口返回格式无效。")
    return data


def _download_bytes(url: str, *, timeout: float = 60.0) -> bytes:
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.URLError as exc:
        raise RuntimeError(f"下载生成图片失败: {exc.reason}") from exc


def generate_image_bytes(prompt: str) -> tuple[bytes, str]:
    """Call the configured image provider. Returns (bytes, extension)."""
    text = (prompt or "").strip()
    if not text:
        raise ValueError("提示词为空。")
    endpoint = get_config().image.resolve()
    if endpoint is None:
        raise ImageNotConfiguredError("未配置生图模型。请在设置 → 图像模型中填写 Key 并选择模型。")

    url = _images_url(endpoint.base_url)
    payload: dict[str, Any] = {
        "model": endpoint.model,
        "prompt": text,
        "n": 1,
        "size": "1024x1024",
        "response_format": "b64_json",
    }
    try:
        data = _http_json(url, payload, endpoint.api_key)
    except RuntimeError as exc:
        if "response_format" in str(exc).lower() or "400" in str(exc):
            payload.pop("response_format", None)
            data = _http_json(url, payload, endpoint.api_key)
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
        blob = _download_bytes(remote)
        ext = "png"
        lower = remote.lower()
        if ".jpg" in lower or ".jpeg" in lower:
            ext = "jpg"
        elif ".webp" in lower:
            ext = "webp"
        return blob, ext
    raise RuntimeError("生图接口既没有 b64_json 也没有 url。")
