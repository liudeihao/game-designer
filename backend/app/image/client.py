"""Image generation facade. Vendors live in ``app.image.adapters``."""

from __future__ import annotations

from app.config import get_config
from app.image.adapters import get_adapter


class ImageNotConfiguredError(RuntimeError):
    """Raised when no usable image provider is configured."""


def generate_image_bytes(prompt: str) -> tuple[bytes, str]:
    """Call the configured image adapter. Returns (bytes, extension)."""
    text = (prompt or "").strip()
    if not text:
        raise ValueError("提示词为空。")
    endpoint = get_config().image.resolve()
    if endpoint is None:
        raise ImageNotConfiguredError("未配置生图模型。请在设置 → 图像模型中填写 Key 并选择模型。")
    return get_adapter(endpoint).generate(text, endpoint)
