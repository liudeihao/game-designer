"""Plan-mode chat contract: one short line in chat; design body goes to tools."""

from __future__ import annotations

PLAN_CHAT_MAX_CHARS = 200

PLAN_CHAT_BOUNCE = """【系统】你刚才把设计写在了聊天里，违反 Plan 合同：聊天只留一句；完整方案必须调用 {dest}，信息不足则 ask_user。
下面是你刚才的草稿，请立即调用 {dest}（或 ask_user），不要再把这篇写进聊天。

---草稿---
{draft}
"""


def is_plan_chat_violation(text: str, *, max_chars: int = PLAN_CHAT_MAX_CHARS) -> bool:
    """True when a no-tool Plan reply is design prose, not a one-line status."""
    body = (text or "").strip()
    return bool(body) and len(body) > max_chars


def bounce_plan_chat(draft: str, dest: str) -> str:
    return PLAN_CHAT_BOUNCE.format(dest=dest, draft=(draft or "").strip())
