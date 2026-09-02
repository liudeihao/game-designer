from app.agent.plan.chat_contract import is_plan_chat_violation
from app.agent.tools.catalog import catalog_miss_message, catalog_names


def test_catalog_names_ignores_non_string_name() -> None:
    class Named:
        name = "write_plan"

    class Dummy:
        name = object()

    assert catalog_names([Named(), Dummy(), object()]) == {"write_plan"}


def test_catalog_miss_in_plan_redirects_to_write_plan() -> None:
    text = catalog_miss_message("workspace_write", {"write_plan", "ask_user"})
    assert "Unknown tool" not in text
    assert "write_plan" in text
    assert "不要重试 workspace_write" in text


def test_catalog_miss_without_plan_lists_available() -> None:
    text = catalog_miss_message("workspace_write", {"workspace_read"})
    assert "workspace_read" in text
    assert "write_plan" not in text


def test_long_plan_chat_is_violation_short_is_not() -> None:
    assert is_plan_chat_violation("") is False
    assert is_plan_chat_violation("已更新右侧 plan。") is False
    assert is_plan_chat_violation("x" * 201) is True
