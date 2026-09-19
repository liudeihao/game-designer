"""Shared HTTP helpers for image adapters."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any


def request_json(
    method: str,
    url: str,
    *,
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 120.0,
) -> dict[str, Any]:
    hdrs = {"Accept": "application/json"}
    if headers:
        hdrs.update(headers)
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        raise RuntimeError(f"生图接口失败 ({exc.code}): {detail or exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"无法连接生图接口: {exc.reason}") from exc
    try:
        parsed = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as exc:
        raise RuntimeError("生图接口返回了无法解析的响应。") from exc
    if parsed is None:
        return {}
    if not isinstance(parsed, dict):
        raise RuntimeError("生图接口返回格式无效。")
    return parsed


def download_bytes(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: float = 60.0,
) -> bytes:
    req = urllib.request.Request(url, headers=headers or {}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.URLError as exc:
        raise RuntimeError(f"下载生成图片失败: {exc.reason}") from exc


def ext_from_url_or_type(url: str = "", content_type: str = "") -> str:
    lower = f"{url} {content_type}".lower()
    if "jpeg" in lower or "jpg" in lower:
        return "jpg"
    if "webp" in lower:
        return "webp"
    if "gif" in lower:
        return "gif"
    return "png"
