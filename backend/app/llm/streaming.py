"""Normalize provider-specific streaming chunks into application events."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any, Literal, TypedDict

from langchain_core.messages import BaseMessage

from .client import get_llm


class StreamChunk(TypedDict):
    layer: Literal["reasoning", "answer"]
    text: str


def _message(chunk: Any) -> Any:
    return chunk if hasattr(chunk, "content") else getattr(chunk, "message", chunk)


def extract_reasoning_text(chunk: Any) -> str:
    """Best-effort reasoning/thinking text from one stream chunk or message."""
    message = _message(chunk)
    extra = getattr(message, "additional_kwargs", None) or {}
    for key in ("reasoning_content", "reasoning", "thinking"):
        value = extra.get(key)
        if isinstance(value, str) and value:
            return value

    content = getattr(message, "content", "")
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for block in content:
        if isinstance(block, dict) and block.get("type") in ("reasoning", "thinking"):
            text = block.get("text") or block.get("reasoning") or ""
            if text:
                parts.append(str(text))
    return "".join(parts)


def extract_answer_text(chunk: Any) -> str:
    """Best-effort answer text from one stream chunk or message."""
    content = getattr(_message(chunk), "content", "")
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return str(content) if content else ""
    parts: list[str] = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            parts.append(str(block.get("text") or ""))
        elif isinstance(block, str):
            parts.append(block)
    return "".join(parts)


async def stream_chat(messages: list[BaseMessage]) -> AsyncIterator[StreamChunk]:
    """Yield normalized reasoning and answer chunks from the primary model."""
    async for chunk in get_llm().astream(messages):
        reasoning = extract_reasoning_text(chunk)
        answer = extract_answer_text(chunk)
        if reasoning:
            yield {"layer": "reasoning", "text": reasoning}
        if answer:
            yield {"layer": "answer", "text": answer}
