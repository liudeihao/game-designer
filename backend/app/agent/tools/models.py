"""Types shared by tool executors and ReAct orchestration."""

from __future__ import annotations

from typing import Any, TypedDict


class ToolExecution(TypedDict, total=False):
    name: str
    args: dict[str, Any]
    result: Any
    error: str
    ok: bool
    call_id: str
    permission_outcome: str
