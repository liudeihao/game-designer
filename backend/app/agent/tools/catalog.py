"""Current-turn tool catalog: what the model may invoke now."""

from __future__ import annotations

from typing import Any, Collection


def catalog_names(tools: list[Any]) -> set[str]:
    """Names actually bound this turn. Ignores mocks whose ``name`` is not a str."""
    names: set[str] = set()
    for tool in tools:
        name = getattr(tool, "name", None)
        if isinstance(name, str) and name:
            names.add(name)
    return names


def catalog_miss_message(name: str, catalog: Collection[str]) -> str:
    """Observation when the model emits a name outside the current catalog.

    Not ``Unknown tool``: the product has the tool, this mode does not.
    """
    catalog_set = {item for item in catalog if item}
    dest = "update_plan" if "update_plan" in catalog_set else (
        "write_plan" if "write_plan" in catalog_set else ""
    )
    if dest:
        return (
            f"当前模式没有工具 {name}，不能修改工作区文档。"
            f"请使用 {dest} 把计划写入右侧面板。不要重试 {name}。"
        )
    if catalog_set:
        available = "、".join(sorted(catalog_set))
        return (
            f"当前模式没有工具 {name}。可用工具：{available}。不要重试 {name}。"
        )
    return f"当前模式没有工具 {name}。不要重试 {name}。"
