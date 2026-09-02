"""Token estimates and the compaction trigger budget."""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any, Sequence

from app.model_presets import (
    DEFAULT_MAX_OUTPUT_TOKENS as DEFAULT_OUTPUT_RESERVE,
    resolve_limits,
)

from ..config import get_config

# Leave headroom for completion + tool/meta overhead inside the context window.
DEFAULT_TRIGGER_RATIO = 0.75


@lru_cache(maxsize=32)
def _tokenizer(model: str = ""):
    """Return the closest available tokenizer for an OpenAI-compatible model."""
    import tiktoken

    name = (model or "").strip()
    try:
        if name:
            return tiktoken.encoding_for_model(name)
        # Current GPT-4o/GPT-5 families use the o200k vocabulary.
        return tiktoken.get_encoding("o200k_base")
    except Exception:
        # Some tiktoken installations lazily download vocabulary data. Context
        # budgeting must still work in offline/self-hosted deployments.
        return None


def _offline_token_estimate(text: str) -> int:
    """Conservative multilingual fallback when tokenizer data is unavailable."""
    ascii_chars = sum(1 for char in text if ord(char) < 128)
    non_ascii_chars = len(text) - ascii_chars
    return non_ascii_chars + (ascii_chars + 3) // 4


def estimate_tokens(text: str, *, model: str | None = None) -> int:
    if not text:
        return 0
    tokenizer = _tokenizer(model or "")
    if tokenizer is None:
        return _offline_token_estimate(text)
    return len(tokenizer.encode(text, disallowed_special=()))


def estimate_messages_tokens(messages: Sequence[Any], *, model: str | None = None) -> int:
    total = 0
    for m in messages:
        content = getattr(m, "content", "") or ""
        if isinstance(content, str):
            total += estimate_tokens(content, model=model)
        else:
            total += estimate_tokens(str(content), model=model)
        tool_calls = getattr(m, "tool_calls", None) or []
        if tool_calls:
            try:
                total += estimate_tokens(
                    json.dumps(tool_calls, ensure_ascii=False, default=str),
                    model=model,
                )
            except Exception:
                total += estimate_tokens(str(tool_calls), model=model)
        # Role / framing overhead
        total += 4
    return total


def _limits_for(model: str | None = None, *, provider_id: str = "") -> tuple[int, int]:
    """Resolve (context_window, max_output_tokens) for a catalog selection."""
    mid = (model or "").strip()
    pid = (provider_id or "").strip()
    llm = getattr(get_config(), "llm", None)
    spec = None
    if llm is not None and hasattr(llm, "find_spec") and mid:
        spec = llm.find_spec(mid, provider_id=pid)
    if spec is not None:
        return resolve_limits(
            spec.id,
            context_window=int(getattr(spec, "context_window", 0) or 0),
            max_output_tokens=int(getattr(spec, "max_output_tokens", 0) or 0),
        )
    if llm is not None and hasattr(llm, "resolve") and not mid:
        endpoint = llm.resolve(utility=False)
        if endpoint:
            ctx = int(getattr(endpoint, "context_window", 0) or 0)
            out = int(getattr(endpoint, "max_output_tokens", 0) or 0)
            if ctx > 0:
                return ctx, out or DEFAULT_OUTPUT_RESERVE
            return resolve_limits(getattr(endpoint, "model", "") or "")
    return resolve_limits(mid)


def resolve_context_limit(model: str | None = None, *, provider_id: str = "") -> int:
    """Return the context window size for *model* (optionally scoped to a provider)."""
    window, _ = _limits_for(model, provider_id=provider_id)
    return window


def token_budget(
    *,
    model: str | None = None,
    provider_id: str = "",
    output_reserve: int | None = None,
    trigger_ratio: float = DEFAULT_TRIGGER_RATIO,
) -> int:
    limit, max_output = _limits_for(model, provider_id=provider_id)
    reserve = DEFAULT_OUTPUT_RESERVE if output_reserve is None else output_reserve
    if output_reserve is None and max_output > 0:
        reserve = max_output
    usable = max(1_024, limit - max(0, reserve))
    return max(512, int(usable * trigger_ratio))
