"""General conversation context compaction for LLM calls.

Used by Studio, Plan, and any agent that needs budget-aware dialogue history.
Optional *purpose* strings specialize the summarizer without forking the algorithm.
"""

from .formatting import format_messages_for_summary, split_turns
from .history import (
    history_as_chat_messages,
    messages_fingerprint,
    resolve_active_history,
)
from .policy import CompactResult, compact_request_if_needed, ensure_compact_context
from .request import DEFAULT_KEEP_TURNS, DEFAULT_SUMMARY_PURPOSE
from .state_update import memory_state_update, replacement_state_update
from .tokens import estimate_tokens, resolve_context_limit
from .hooks import (
    clear_compaction_hooks,
    register_post_compact_hook,
    register_pre_compact_hook,
)

__all__ = [
    "CompactResult",
    "compact_request_if_needed",
    "DEFAULT_KEEP_TURNS",
    "DEFAULT_SUMMARY_PURPOSE",
    "ensure_compact_context",
    "estimate_tokens",
    "format_messages_for_summary",
    "history_as_chat_messages",
    "memory_state_update",
    "messages_fingerprint",
    "replacement_state_update",
    "resolve_active_history",
    "resolve_context_limit",
    "split_turns",
    "clear_compaction_hooks",
    "register_post_compact_hook",
    "register_pre_compact_hook",
]
