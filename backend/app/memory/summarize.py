"""Call the utility LLM to fold older turns into a running summary."""

from __future__ import annotations

import asyncio
import inspect
import logging
import time
from collections.abc import Callable
from typing import Any, Sequence

from langchain_core.messages import BaseMessage

from app.llm import get_llm, parse_json_object
from app.usage import compaction_invoke_config

from .formatting import format_messages_for_summary, message_text
from .request import (
    DEFAULT_KEEP_TURNS,
    DEFAULT_SUMMARY_PURPOSE,
    build_compaction_request,
)
from .tokens import estimate_tokens

logger = logging.getLogger(__name__)

DEFAULT_COMPACT_RETRIES = 2

CompactNotify = Callable[[], Any]


async def _run_notify(callback: CompactNotify | None) -> None:
    if callback is None:
        return
    result = callback()
    if inspect.isawaitable(result):
        await result


def _status_code(error: Exception) -> int | None:
    for value in (
        getattr(error, "status_code", None),
        getattr(getattr(error, "response", None), "status_code", None),
    ):
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            continue
    return None


def _is_context_window_error(error: Exception) -> bool:
    text = str(error).lower()
    return any(
        marker in text
        for marker in (
            "context window",
            "context_length_exceeded",
            "maximum context length",
            "prompt is too long",
            "too many tokens",
        )
    )


def _is_retryable_error(error: Exception) -> bool:
    status = _status_code(error)
    if status in {408, 409, 425, 429} or (status is not None and status >= 500):
        return True
    text = str(error).lower()
    return any(
        marker in text
        for marker in (
            "timeout",
            "timed out",
            "connection",
            "rate limit",
            "temporarily unavailable",
            "service unavailable",
        )
    )


def _remove_oldest_compactable_message(messages: list[BaseMessage]) -> bool:
    """Drop the oldest context item after the compact system and instruction header."""
    start = 0
    if messages and getattr(messages[0], "type", "") == "system":
        start = 1
    if start < len(messages) and (
        getattr(messages[start], "additional_kwargs", None) or {}
    ).get("compaction_instruction"):
        start += 1
    for index in range(start, max(start, len(messages) - 1)):
        extra = getattr(messages[index], "additional_kwargs", None) or {}
        if extra.get("compact_source") == "system" or extra.get("compact_boundary"):
            continue
        del messages[index]
        return True
    for index in range(start, max(start, len(messages) - 1)):
        del messages[index]
        return True
    return False


async def summarize_history(
    *,
    existing_summary: str,
    older_messages: Sequence[Any],
    recent_messages: Sequence[Any] = (),
    purpose: str = DEFAULT_SUMMARY_PURPOSE,
    compaction_messages: Sequence[BaseMessage] | None = None,
    utility: bool = False,
    keep_turns: int = DEFAULT_KEEP_TURNS,
    max_retries: int = DEFAULT_COMPACT_RETRIES,
    telemetry: dict[str, Any] | None = None,
    on_start: CompactNotify | None = None,
    on_end: CompactNotify | None = None,
) -> str:
    """Fold older turns into a compact running summary."""
    older_block = format_messages_for_summary(older_messages)
    if not older_block.strip() and not (existing_summary or "").strip():
        if compaction_messages is None:
            return (existing_summary or "").strip()
        if not any(message_text(m) for m in compaction_messages):
            return (existing_summary or "").strip()

    request_messages = build_compaction_request(
        compaction_messages,
        existing_summary=existing_summary,
        older_messages=older_messages,
        recent_messages=recent_messages,
        purpose=purpose,
        keep_turns=keep_turns,
    )

    def _extractive_fallback() -> str:
        parts = []
        if (existing_summary or "").strip():
            parts.append(existing_summary.strip())
        if older_block.strip():
            parts.append(older_block.strip()[:2000])
        merged = "\n".join(parts)
        return merged[:2400] if merged else ""

    llm = get_llm(utility=utility)
    telemetry = telemetry if telemetry is not None else {}
    started = time.monotonic()
    attempts = 0
    overflow_trims = 0
    await _run_notify(on_start)
    try:
        while True:
            try:
                resp = await llm.ainvoke(
                    request_messages,
                    config=compaction_invoke_config(),
                )
                text = getattr(resp, "content", "") or ""
                if isinstance(text, list):
                    text = "".join(
                        str(b.get("text") if isinstance(b, dict) else b) for b in text
                    )
                text = str(text).strip()
                parsed = parse_json_object(text)
                if parsed.get("summary"):
                    text = str(parsed["summary"]).strip()
                if parsed and not parsed.get("summary") and text.startswith("{"):
                    text = ""
                if text:
                    telemetry.update(
                        {
                            "status": "completed",
                            "retries": attempts,
                            "overflow_trims": overflow_trims,
                            "summary_tokens": estimate_tokens(text),
                            "duration_ms": round((time.monotonic() - started) * 1000),
                        }
                    )
                    return text
                raise ValueError("compaction returned an empty summary")
            except Exception as error:
                if _is_context_window_error(error) and _remove_oldest_compactable_message(
                    request_messages
                ):
                    overflow_trims += 1
                    logger.warning(
                        "Compaction context overflow; removed oldest history item (trim=%s)",
                        overflow_trims,
                    )
                    continue
                if _is_retryable_error(error) and attempts < max(0, max_retries):
                    attempts += 1
                    logger.warning(
                        "Transient compaction failure; retrying (%s/%s): %s",
                        attempts,
                        max_retries,
                        error,
                    )
                    await asyncio.sleep(min(0.25 * (2 ** (attempts - 1)), 2.0))
                    continue
                logger.exception("Compaction failed; using extractive fallback", exc_info=error)
                telemetry.update(
                    {
                        "status": "fallback",
                        "error_type": type(error).__name__,
                        "error": str(error)[:500],
                        "retries": attempts,
                        "overflow_trims": overflow_trims,
                        "duration_ms": round((time.monotonic() - started) * 1000),
                    }
                )
                break

        fallback = _extractive_fallback()
        telemetry["summary_tokens"] = estimate_tokens(fallback)
        return fallback
    finally:
        await _run_notify(on_end)
