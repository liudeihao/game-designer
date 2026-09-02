"""User Rule / Project Rule store, prompt compose, and proposal Event."""

from __future__ import annotations

import json

import pytest

from app.conversations.events import rule_proposal_event
from app.rules import (
    LEGACY_MIGRATED_NAME,
    already_proposed_this_turn,
    apply_rule_op,
    compose_system_prompt,
    format_rule_sections,
    normalize_proposal_args,
    parse_rules_for_save,
    read_project_rules,
    read_user_rules,
    rule_payload,
    split_system_and_rules,
    user_rules_path,
    write_project_rules,
    write_user_rules,
)
from app.docs import ensure_seeded


def test_data_dir_fixture_isolates_user_rules(data_dir) -> None:
    assert user_rules_path() == data_dir / "user-rules.json"


def test_compose_omits_empty_levels() -> None:
    assert compose_system_prompt("SYS") == "SYS"
    assert compose_system_prompt("SYS", user_rules=[]) == "SYS"
    out = compose_system_prompt(
        "SYS",
        user_rules=[{"name": "先问再写", "details": "动手前先对齐范围。"}],
        project_rules=[{"name": "先谈经济", "details": "本项目先对齐资源循环。"}],
    )
    assert out.startswith("SYS")
    assert "## User Rule\n### 先问再写\n动手前先对齐范围。" in out
    assert "## Project Rule\n### 先谈经济\n本项目先对齐资源循环。" in out
    assert compose_system_prompt(
        "SYS", project_rules=[{"name": "只改这一作", "details": "不要扩范围。"}]
    ).count("## User Rule") == 0


def test_split_system_and_rules_peels_named_sections() -> None:
    composed = compose_system_prompt(
        "SYS",
        user_rules=[{"name": "先问再写", "details": "动手前先对齐范围。"}],
    )
    system, rules = split_system_and_rules(composed)
    assert system == "SYS"
    assert rules.startswith("## User Rule")
    assert "先问再写" in rules
    assert split_system_and_rules("只有系统") == ("只有系统", "")
    assert format_rule_sections() == ""


def test_apply_rule_op_add_update_delete() -> None:
    added = apply_rule_op([], "add", "先问", "动手前先问。")
    assert added == [{"id": added[0]["id"], "name": "先问", "details": "动手前先问。"}]

    updated = apply_rule_op(added, "add", "先问", "动手前先对齐范围。")
    assert len(updated) == 1
    assert updated[0]["details"] == "动手前先对齐范围。"
    assert updated[0]["id"] == added[0]["id"]

    extra = apply_rule_op(updated, "update", "用中文", "始终用中文回复。")
    assert [item["name"] for item in extra] == ["先问", "用中文"]

    deleted = apply_rule_op(extra, "delete", "先问")
    assert [item["name"] for item in deleted] == ["用中文"]
    assert apply_rule_op(deleted, "delete", "不存在") == deleted


def test_user_and_project_rules_persist(data_dir) -> None:
    assert read_user_rules() == []
    write_user_rules([{"name": "全局先对齐", "details": "动手前先对齐范围。"}])
    items = read_user_rules()
    assert len(items) == 1
    assert items[0]["name"] == "全局先对齐"
    assert items[0]["details"] == "动手前先对齐范围。"
    assert (data_dir / "user-rules.json").is_file()

    pid = "proj_rule_test"
    ensure_seeded(pid)
    assert read_project_rules(pid) == []
    write_project_rules(pid, [{"name": "先谈经济", "details": "本项目先谈经济"}])
    project = read_project_rules(pid)
    assert project[0]["name"] == "先谈经济"
    assert (data_dir / "projects" / pid / ".studio" / "rules.json").is_file()


def test_migrates_legacy_markdown_blob(data_dir) -> None:
    (data_dir / "user-rules.md").write_text("先问再写\n\n用中文", encoding="utf-8")
    items = read_user_rules()
    assert len(items) == 1
    assert items[0]["name"] == LEGACY_MIGRATED_NAME
    assert items[0]["details"] == "先问再写\n\n用中文"
    saved = json.loads((data_dir / "user-rules.json").read_text(encoding="utf-8"))
    assert saved["rules"][0]["details"] == "先问再写\n\n用中文"

    pid = "proj_legacy"
    ensure_seeded(pid)
    studio = data_dir / "projects" / pid / ".studio"
    (studio / "rules.md").write_text("本项目先谈经济", encoding="utf-8")
    project = read_project_rules(pid)
    assert project[0]["name"] == LEGACY_MIGRATED_NAME
    assert project[0]["details"] == "本项目先谈经济"
    assert (studio / "rules.json").is_file()


def test_json_wins_over_stale_markdown(data_dir) -> None:
    write_user_rules([{"name": "用中文", "details": "始终用中文。"}])
    (data_dir / "user-rules.md").write_text("旧的一整段", encoding="utf-8")
    items = read_user_rules()
    assert items[0]["name"] == "用中文"
    assert items[0]["details"] == "始终用中文。"


def test_parse_rules_for_save_rejects_blank_and_duplicate() -> None:
    with pytest.raises(ValueError, match="必须有名称"):
        parse_rules_for_save([{"name": "  ", "details": "x"}])
    with pytest.raises(ValueError, match="重复"):
        parse_rules_for_save(
            [
                {"name": "先问", "details": "a"},
                {"name": "先问", "details": "b"},
            ]
        )


def test_rule_payload_warns_on_total_tokens() -> None:
    payload = rule_payload([{"id": "r1", "name": "短", "details": "一句"}])
    assert payload["rules"][0]["name"] == "短"
    assert payload["warn"] is False
    assert "text" not in payload


def test_normalize_proposal_args_defaults() -> None:
    assert normalize_proposal_args(
        {"scope": "user", "operation": "add", "name": " 先问 ", "details": " 动手前先问。 "}
    ) == {
        "scope": "user",
        "operation": "add",
        "name": "先问",
        "details": "动手前先问。",
    }
    legacy = normalize_proposal_args({"scope": "nope", "operation": "append", "text": "  x  "})
    assert legacy["scope"] == "project"
    assert legacy["operation"] == "add"
    assert legacy["details"] == "x"
    assert normalize_proposal_args(None)["operation"] == "add"
    assert normalize_proposal_args({"operation": "clear", "name": "旧段"})["operation"] == "delete"


def test_already_proposed_this_turn() -> None:
    events = [
        rule_proposal_event(
            proposal_id="a",
            scope="project",
            operation="add",
            name="先谈经济",
            details="本项目先对齐资源循环。",
            after_human=2,
        )
    ]
    assert already_proposed_this_turn(events, 2)
    assert not already_proposed_this_turn(events, 1)


def test_rule_proposal_event_shape() -> None:
    event = rule_proposal_event(
        proposal_id="p1",
        scope="user",
        operation="update",
        name="用表格",
        details="对比用表格。",
        status="pending",
        after_human=3,
    )
    assert event["type"] == "rule_proposal"
    assert event["id"] == "p1"
    assert event["status"] == "pending"
    assert event["after_human"] == 3
    assert event["name"] == "用表格"
    assert event["details"] == "对比用表格。"
    assert "text" not in event
