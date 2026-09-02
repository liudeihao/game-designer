"""Mode deny-and-explain. Tools check runtime.context.mode themselves."""

from __future__ import annotations

from collections.abc import Collection


def denied_message(name: str, mode: str, allowed: Collection[str]) -> str:
    labels = [("Agent 常态" if m == "" else m) for m in sorted(allowed)]
    allowed_txt = "、".join(labels) or "（无）"
    current_label = "Agent 常态" if mode == "" else f"{mode} 模式"
    return (
        f"当前是 {current_label}，不能调用 {name}（仅限 {allowed_txt}）。"
        "请让用户在界面切换到对应模式后再试。不要重试本工具。"
    )
