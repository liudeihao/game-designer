"""Bind a usage handler into LangChain config for calls outside stream_run."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from .tracker import UsageCallbackHandler


@contextmanager
def bind_usage_turn(handler: UsageCallbackHandler) -> Iterator[UsageCallbackHandler]:
    """Start a usage turn and put the handler on the runnable config context."""
    handler.start_turn()
    token = None
    try:
        from langchain_core.runnables.config import var_child_runnable_config

        token = var_child_runnable_config.set(
            {
                "callbacks": [handler],
                "metadata": {
                    "project_id": handler.project_id,
                    "conversation_id": handler.conversation_id,
                    "turn_id": handler.turn_id,
                    "role": "compaction",
                },
                "tags": ["role:compaction", "compact", "utility"],
            }
        )
        yield handler
    finally:
        if token is not None:
            try:
                from langchain_core.runnables.config import var_child_runnable_config

                var_child_runnable_config.reset(token)
            except Exception:
                pass
        handler.end_turn()
