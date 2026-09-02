"""Extract message text and render turns for compaction context."""

from __future__ import annotations

from typing import Any, Sequence


def message_text(message: Any) -> str:
    content = getattr(message, "content", "") or ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                text = block.get("text") or block.get("content") or ""
                if text:
                    parts.append(str(text))
                elif block.get("type") in {"image", "image_url", "input_image"}:
                    parts.append("[图片]")
            else:
                parts.append(str(block))
        return " ".join(parts).strip()
    return str(content).strip()


def split_turns(messages: Sequence[Any]) -> list[list[Any]]:
    """Group messages into turns; each HumanMessage starts a new turn."""
    turns: list[list[Any]] = []
    current: list[Any] = []
    for m in messages:
        role = getattr(m, "type", "") or ""
        if role == "human" and current:
            turns.append(current)
            current = [m]
        else:
            current.append(m)
    if current:
        turns.append(current)
    return turns


def format_message_for_summary(message: Any) -> str:
    """Render one message as a labeled line for compaction context."""
    text = message_text(message)
    role = getattr(message, "type", "") or "ai"
    label = {
        "human": "用户",
        "ai": "助手",
        "tool": "工具",
        "system": "系统",
    }.get(role, role or "消息")
    extras: list[str] = []
    tool_calls = getattr(message, "tool_calls", None) or []
    if tool_calls:
        names = []
        for call in tool_calls:
            name = call.get("name") if isinstance(call, dict) else getattr(call, "name", "")
            if name:
                names.append(str(name))
        extras.append("调用工具: " + ", ".join(names) if names else "调用工具")
    body = text
    if extras:
        suffix = "; ".join(extras)
        body = f"{text} ({suffix})" if text else f"({suffix})"
    if not body:
        return ""
    return f"{label}: {body}"


def format_messages_for_summary(messages: Sequence[Any]) -> str:
    lines: list[str] = []
    for message in messages:
        line = format_message_for_summary(message)
        if line:
            lines.append(line)
    return "\n".join(lines)


def _flatten(turns: Sequence[Sequence[Any]]) -> list[Any]:
    out: list[Any] = []
    for turn in turns:
        out.extend(turn)
    return out
