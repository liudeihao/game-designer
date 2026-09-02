"""Tests for Markdown docs workspace (file-level OCC)."""

from __future__ import annotations

import pytest

from app.docs import (
    DEFAULT_PLAN_TITLE,
    DocsWriteConflict,
    ensure_seeded,
    list_files,
    list_plan_snapshots,
    load_revs,
    load_workspace,
    normalize_rel_path,
    project_docs_dir,
    project_studio_dir,
    read_file,
    read_plan_snapshot,
    workspace_card,
    workspace_snapshot,
    write_files,
    write_plan_snapshot,
)


@pytest.fixture
def project_id(data_dir):
    pid = "proj_test_docs"
    ensure_seeded(pid)
    return pid


def test_seeded_layout(project_id):
    docs = project_docs_dir(project_id)
    studio = project_studio_dir(project_id)
    assert docs.is_dir()
    assert not any(docs.iterdir())
    assert (studio / "meta.json").is_file()
    assert (studio / "plans").is_dir()


def test_write_and_occ(project_id):
    files = load_workspace(project_id)
    assert files == {}

    snap = write_files(
        project_id,
        {"systems/core.md": "# Core\n"},
        based_on={"systems/core.md": None},
    )
    assert snap["files"]["systems/core.md"] == "# Core\n"
    assert snap["revs"]["systems/core.md"] == 1

    snap2 = write_files(
        project_id,
        {"systems/core.md": "# Core v2\n"},
        based_on={"systems/core.md": 1},
    )
    assert snap2["revs"]["systems/core.md"] == 2

    snap3 = write_files(
        project_id,
        {"systems/core.md": None},
        based_on={"systems/core.md": 2},
    )
    assert "systems/core.md" not in snap3["files"]
    assert "systems/core.md" not in snap3["revs"]


def test_write_conflict(project_id):
    write_files(
        project_id,
        {"x.md": "v1"},
        based_on={"x.md": None},
    )
    with pytest.raises(DocsWriteConflict) as exc:
        write_files(
            project_id,
            {"x.md": "v2"},
            based_on={"x.md": None},
        )
    assert exc.value.conflicts


def test_conflict_writes_nothing(project_id):
    before = load_workspace(project_id)
    with pytest.raises(DocsWriteConflict):
        write_files(
            project_id,
            {"new.md": "hi"},
            based_on={"new.md": 99},
        )
    after = load_workspace(project_id)
    assert after == before


def test_plan_snapshots(project_id):
    p1 = write_plan_snapshot(project_id, "conv_abc", "# plan 1\n")
    p2 = write_plan_snapshot(project_id, "conv_abc", "# plan 2\n")
    assert p1 != p2
    assert p1.endswith(".md")
    assert read_plan_snapshot(project_id, p1).startswith("# plan 1")
    assert read_plan_snapshot(project_id, p2).startswith("# plan 2")


def test_plan_snapshot_filename_carries_the_title(project_id):
    path = write_plan_snapshot(project_id, "conv_abc", "## 目标\n- 定循环", "核心战斗循环")
    assert path == ".studio/plans/conv_abc-1-核心战斗循环.md"
    assert read_plan_snapshot(project_id, path).startswith("# 核心战斗循环")


def test_plan_snapshot_keeps_an_existing_h1_instead_of_stacking_titles(project_id):
    path = write_plan_snapshot(project_id, "conv_abc", "# 核心战斗循环\n- 定循环", "核心战斗循环")
    assert read_plan_snapshot(project_id, path).count("# 核心战斗循环") == 1


def test_untitled_plan_still_gets_a_name(project_id):
    path = write_plan_snapshot(project_id, "conv_abc", "- 没有标题的正文")
    assert read_plan_snapshot(project_id, path).startswith(f"# {DEFAULT_PLAN_TITLE}")


def test_list_plan_snapshots_is_newest_first_and_scoped_to_one_conversation(project_id):
    write_plan_snapshot(project_id, "conv_abc", "body", "第一份")
    write_plan_snapshot(project_id, "conv_abc", "body", "第二份")
    write_plan_snapshot(project_id, "conv_other", "body", "别人的")

    plans = list_plan_snapshots(project_id, "conv_abc")
    assert [p["title"] for p in plans] == ["第二份", "第一份"]
    assert [p["seq"] for p in plans] == [2, 1]
    assert all(p["path"].startswith(".studio/plans/conv_abc-") for p in plans)


def test_numbering_survives_legacy_snapshots_without_a_slug(project_id):
    plans_dir = project_studio_dir(project_id) / "plans"
    plans_dir.mkdir(parents=True, exist_ok=True)
    (plans_dir / "conv_abc-7.md").write_text("# 老计划\n", encoding="utf-8")

    path = write_plan_snapshot(project_id, "conv_abc", "body", "新计划")
    assert path == ".studio/plans/conv_abc-8-新计划.md"


def test_workspace_card(project_id):
    files = load_workspace(project_id)
    assert "empty" in workspace_card(files)
    write_files(project_id, {"x.md": "hi"}, based_on={"x.md": None})
    card = workspace_card(load_workspace(project_id))
    assert "x.md" in card


def test_normalize_rel_path():
    assert normalize_rel_path("systems/core.md") == "systems/core.md"
    with pytest.raises(ValueError):
        normalize_rel_path("../etc/passwd")
    with pytest.raises(ValueError):
        normalize_rel_path("/abs/path.md")
    with pytest.raises(ValueError):
        normalize_rel_path("notes.txt")


def test_list_and_read(project_id):
    write_files(project_id, {"a/b.md": "content"}, based_on={"a/b.md": None})
    entries = list_files(project_id, path="a")
    paths = [e["path"] for e in entries]
    assert "a/b.md" in paths
    result = read_file(project_id, "a/b.md")
    assert result["ok"] is True
    assert result["content"] == "content"
