"""Internal Execute Plan instruction builder."""

from __future__ import annotations


def execute_plan_instruction(snap_path: str, plan_md: str) -> str:
    """Internal instruction for the Agent (not a user-visible chat bubble)."""
    path = (snap_path or "").strip() or "(unknown)"
    body = (plan_md or "").strip()
    return (
        "【内部指令 · Execute Plan · execute_plan】本轮已获授权，无需再与用户对齐范围。\n"
        f"plan 正文已内嵌在下方（副本存档于 `{path}`，无需也无法读取），请据此把设计写入 Markdown 设计文档。\n"
        "不要复述本指令；不要重新澄清目标；空项目不要无意义地列出目录。\n"
        "plan 只规定要做哪些设计工作；具体方案由本轮写入文档时决定，可合理默认，不要再向用户提问。\n"
        "按 plan 的文档范围写入/更新 Markdown。"
        "若 plan 已列出具体路径则沿用；否则根据范围与现有工作区决定中文文件名。"
        "同类可放进同一目录，但避免过度拆分，也不必先建空目录。"
        "路径相对设计文档根目录，不要带 `docs/` 前缀。"
        "新建文件用中文文件名，正文用中文（RPG、NPC 等英文术语可保留）；"
        "已有文件沿用原路径。"
        "完成后用简洁中文总结改动。\n\n"
        f"--- plan ({path}) ---\n"
        f"{body}\n"
        "--- end plan ---"
    )
