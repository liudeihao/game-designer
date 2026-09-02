"""Built-in context-window / max-output presets for known model families.

Zero-dependency on purpose: ``config.py`` imports this module, and the LLM
client package imports ``config``, so this file must not import either.
Lookup is longest-prefix, case-insensitive.

Values are the vendor-advertised context window and maximum output tokens
(not a conservative request default). User overrides still win in
``resolve_limits``.
"""

from __future__ import annotations

DEFAULT_CONTEXT_WINDOW = 128_000
DEFAULT_MAX_OUTPUT_TOKENS = 4_096

# (prefix, context_window, max_output_tokens). Longer prefixes win.
KNOWN_MODELS: list[tuple[str, int, int]] = [
    # DeepSeek — V4 hosted IDs are 1M / 384K; legacy chat/reasoner aliases
    # currently route at V4-Flash but keep their historical ceilings.
    ("deepseek-v4", 1_000_000, 384_000),
]


def preset_for(model: str) -> tuple[int, int]:
    """Return ``(context_window, max_output_tokens)``; zeros when unknown."""
    name = (model or "").strip().lower()
    if not name:
        return 0, 0
    for prefix, window, output in sorted(KNOWN_MODELS, key=lambda item: len(item[0]), reverse=True):
        if prefix in name:
            return window, output
    return 0, 0


def resolve_limits(
    model: str,
    *,
    context_window: int = 0,
    max_output_tokens: int = 0,
) -> tuple[int, int]:
    """User override > prefix preset > product default."""
    preset_window, preset_output = preset_for(model)
    window = context_window if context_window > 0 else preset_window or DEFAULT_CONTEXT_WINDOW
    output = max_output_tokens if max_output_tokens > 0 else preset_output or DEFAULT_MAX_OUTPUT_TOKENS
    return window, output
