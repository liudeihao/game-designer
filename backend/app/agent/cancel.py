"""Cooperative cancel flag for an in-flight graph run.

The token lives on ``RunnableConfig["configurable"]["run_cancel"]`` so graph
nodes can read it the same way they read ``get_stream_writer()``. ContextVar
is not used: ``stream_run`` is an async generator and those do not reliably
propagate context across ``asend``.
"""

from __future__ import annotations

from typing import Any


class RunCancel:
    """Mutable flag. ``request()`` is idempotent and safe to call from another task."""

    def __init__(self) -> None:
        self.requested = False

    def request(self) -> None:
        self.requested = True


def cancel_requested() -> bool:
    """True when the current graph run has been asked to stop. Best-effort."""
    try:
        from langgraph.config import get_config

        cfg: Any = get_config() or {}
    except Exception:
        return False
    token = (cfg.get("configurable") or {}).get("run_cancel")
    return bool(token is not None and getattr(token, "requested", False))
