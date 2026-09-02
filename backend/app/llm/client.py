"""Create chat-model clients from the active application configuration."""

from __future__ import annotations

from typing import Any

from app.config import get_config


class LLMNotConfiguredError(RuntimeError):
    """Raised when no usable model provider is configured."""


def get_llm(*, utility: bool = False):
    """Return the configured primary or utility chat model."""
    endpoint = get_config().llm.resolve(utility=utility)
    if endpoint is None:
        raise LLMNotConfiguredError(
            "未配置可用的 LLM。请在设置中填写厂商 API Key 并选择模型。"
        )

    from langchain_openai import ChatOpenAI

    kwargs: dict[str, Any] = {
        "model": endpoint.model,
        "api_key": endpoint.api_key,
        # openai 3.x clients are httpx2; langchain-openai's default
        # TCP-keepalive path still injects an httpx transport. `()` is
        # the documented opt-out so both sides stay on httpx2.
        "http_socket_options": (),
    }
    if (endpoint.base_url or "").strip():
        kwargs["base_url"] = endpoint.base_url

    try:
        return ChatOpenAI(**kwargs, stream_usage=True)
    except TypeError:
        try:
            return ChatOpenAI(**kwargs)
        except TypeError:
            kwargs.pop("http_socket_options", None)
            return ChatOpenAI(**kwargs)
