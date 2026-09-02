"""Tests for Markdown workspace tools and DocsSession."""

import json

import pytest
from pydantic import ValidationError

from app.agent.helpers import normalize_file_refs
from app.agent.context import AgentContext
from app.agent.tools.inject import fake_tool_runtime
from app.agent.tools.docs import workspace_write
from app.agent.tools.executor import execute_tool_calls
from app.agent.tools.schemas import WorkspaceWriteArgs
from app.docs import (
    DocsSession,
    conversation_get_summary,
    load_workspace,
    workspace_card,
    workspace_grep,
    workspace_list,
    workspace_read,
    write_files,
)


def _sample_files() -> dict[str, str]:
    return {
        "README.md": "# Demo\n\nSeed readme.\n",
        "combat.md": "# Combat\n\n冲刺与格挡。\n",
        "systems/economy.md": "# Economy\n\n金币与商店。\n",
    }


def _cmd_text(result) -> str:
    msgs = (result.update or {}).get("messages") or []
    return str(msgs[0].content) if msgs else ""


def _session(data_dir, files=None, **kwargs) -> DocsSession:
    del data_dir
    pid = "proj_ws"
    if files:
        write_files(pid, dict(files), based_on={path: None for path in files})
    return DocsSession(pid, **kwargs)


def test_workspace_card_empty_and_files() -> None:
    assert "empty" in workspace_card({})
    assert "empty" in workspace_card({"README.md": "x"})
    card = workspace_card(_sample_files())
    assert "3 files" in card or "files" in card
    assert "combat.md" in card


def test_workspace_list_and_read() -> None:
    files = _sample_files()
    root = workspace_list(files)
    assert root["ok"] is True
    paths = {e["path"] for e in root["entries"]}
    assert "combat.md" in paths
    assert "systems" in paths
    assert "README.md" in paths

    sys_dir = workspace_list(files, path="systems")
    assert sys_dir["ok"] is True
    assert any(e["path"] == "systems/economy.md" for e in sys_dir["entries"])

    combat = workspace_read(files, "combat.md")
    assert combat["ok"] is True
    assert "冲刺" in combat["content"]

    eco = workspace_read(files, "systems/economy.md")
    assert eco["ok"] is True
    assert "金币" in eco["content"]


def test_workspace_grep() -> None:
    hits = workspace_grep(_sample_files(), "冲刺")
    assert hits["ok"] is True
    assert hits["count"] >= 1
    assert any(m["path"] == "combat.md" for m in hits["matches"])


def test_conversation_summary() -> None:
    empty = conversation_get_summary("")
    assert empty["empty"] is True
    filled = conversation_get_summary("先前讨论了战斗节奏")
    assert filled["empty"] is False
    assert "战斗" in filled["summary"]


def test_session_write_read_delete(data_dir) -> None:
    session = _session(data_dir, _sample_files())
    result = session.write(
        [{"path": "systems/progression.md", "content": "# Progression\n\n升级曲线。\n"}]
    )
    assert result["ok"] is True
    assert result["results"][0]["rev"] == 1
    read_back = session.read("systems/progression.md")
    assert read_back["ok"] is True
    assert "升级" in read_back["content"]

    listed = session.list("systems")
    paths = {e["path"] for e in listed["entries"]}
    assert "systems/progression.md" in paths

    deleted = session.delete(["combat.md"])
    assert deleted["ok"] is True
    assert "combat.md" not in session.files
    disk = load_workspace("proj_ws")
    assert "systems/progression.md" in disk
    assert "combat.md" not in disk


def test_session_write_rejects_non_md(data_dir) -> None:
    session = _session(data_dir, _sample_files())
    bad = session.write([{"path": "vision.json", "content": "{}"}])
    assert bad["ok"] is False


async def test_workspace_write_tool_writes_file_list(data_dir) -> None:
    session = _session(data_dir, _sample_files())
    runtime = fake_tool_runtime(
        state={"project_id": "proj_ws"},
        context=AgentContext(workspace_id="proj_ws", writable=True),
    )
    result = workspace_write.func(
        files=[{"path": "notes.md", "content": "# Notes\n\n工具写入。\n"}],
        runtime=runtime,
    )
    payload = json.loads(_cmd_text(result))
    assert payload["ok"] is True
    assert payload["results"][0]["rev"] == 1
    assert "工具写入" in load_workspace("proj_ws")["notes.md"]
    writes = result.update.get("workspace_writes") or []
    assert any(item.get("path") == "notes.md" for item in writes)
    assert "notes.md" in (result.update.get("read_paths") or [])


def test_workspace_write_args_rejects_single_file_dict() -> None:
    with pytest.raises(ValidationError):
        WorkspaceWriteArgs.model_validate(
            {"files": {"path": "00-concept.md", "content": "test"}}
        )


def test_workspace_write_args_rejects_top_level_path_content() -> None:
    with pytest.raises(ValidationError):
        WorkspaceWriteArgs.model_validate({"path": "00-concept.md", "content": "test"})


async def test_workspace_write_invalid_files_error_returns_to_caller(data_dir) -> None:
    _session(data_dir, _sample_files())
    results = await execute_tool_calls(
        [
            {
                "id": "c1",
                "name": "workspace_write",
                "args": {"files": {"path": "00-concept.md", "content": "test"}},
            }
        ],
        [workspace_write],
    )
    assert results[0]["ok"] is False
    assert "list" in (results[0].get("error") or "").lower()
    assert "00-concept.md" not in load_workspace("proj_ws")


def test_session_search_replace(data_dir) -> None:
    session = _session(data_dir, _sample_files())
    session.read("combat.md")
    result = session.search_replace("combat.md", "冲刺与格挡。", "冲刺、格挡与闪避。")
    assert result["ok"] is True
    assert result["rev"] == 2
    assert "闪避" in session.read("combat.md")["content"]
    assert "闪避" in load_workspace("proj_ws")["combat.md"]


def test_search_replace_requires_existing(data_dir) -> None:
    session = _session(data_dir, _sample_files())
    result = session.search_replace("missing.md", "a", "b")
    assert result["ok"] is False


def test_read_before_write_blocks_blind_update(data_dir) -> None:
    session = _session(data_dir, _sample_files(), require_read_before_write=True)
    blocked = session.write(
        [{"path": "combat.md", "content": "# Combat\n\n未读就改\n"}]
    )
    assert blocked["ok"] is False
    assert "先读后写" in blocked["error"]

    assert session.read("combat.md")["ok"] is True
    ok = session.write([{"path": "combat.md", "content": "# Combat\n\n读过再改\n"}])
    assert ok["ok"] is True
    assert "读过再改" in session.read("combat.md")["content"]


def test_read_before_write_allows_creating_new_files(data_dir) -> None:
    """Listing a directory tells you nothing about a file that does not exist yet.

    Requiring it would also contradict the empty-workspace rule in the prompts.
    """
    session = _session(data_dir, _sample_files(), require_read_before_write=True)
    ok = session.write([{"path": "systems/new.md", "content": "# New\n"}])
    assert ok["ok"] is True
    assert session.files["systems/new.md"] == "# New\n"
    assert load_workspace("proj_ws")["systems/new.md"] == "# New\n"


def test_read_before_write_blocks_blind_delete_and_replace(data_dir) -> None:
    session = _session(data_dir, _sample_files(), require_read_before_write=True)
    blocked_delete = session.delete(["combat.md"])
    assert blocked_delete["ok"] is False
    assert "先读后写" in blocked_delete["error"]

    blocked_replace = session.search_replace("combat.md", "Combat", "战斗")
    assert blocked_replace["ok"] is False
    assert "先读后写" in blocked_replace["error"]

    assert session.read("combat.md")["ok"] is True
    assert session.search_replace("combat.md", "Combat", "战斗")["ok"] is True


def test_multi_file_write_is_one_atomic_batch(data_dir) -> None:
    session = _session(data_dir, _sample_files())
    ok = session.write(
        [
            {"path": "a.md", "content": "# A\n"},
            {"path": "b.md", "content": "# B\n"},
        ]
    )
    assert ok["ok"] is True
    assert ok["count"] == 2
    disk = load_workspace("proj_ws")
    assert disk["a.md"] == "# A\n"
    assert disk["b.md"] == "# B\n"
    assert ok["results"][0]["rev"] == 1
    assert ok["results"][1]["rev"] == 1


def test_write_conflict_is_tool_error(data_dir) -> None:
    session = _session(data_dir, {"x.md": "v1"})
    write_files("proj_ws", {"x.md": "v2"}, based_on={"x.md": 1})
    result = session.write([{"path": "x.md", "content": "from session\n"}])
    assert result["ok"] is False
    assert "冲突" in result["error"]
    assert result["hint"]
    assert load_workspace("proj_ws")["x.md"] == "v2"
    assert "from session" not in load_workspace("proj_ws")["x.md"]


async def test_write_conflict_via_tool_marks_call_failed(data_dir) -> None:
    _session(data_dir, {"x.md": "v1"})
    write_files("proj_ws", {"x.md": "v2"}, based_on={"x.md": 1})
    runtime = fake_tool_runtime(
        state={"project_id": "proj_ws", "workspace_revs": {"x.md": 1}},
        context=AgentContext(
            workspace_id="proj_ws",
            writable=True,
            require_read_before_write=False,
        ),
    )
    with pytest.raises(RuntimeError, match="冲突"):
        workspace_write.func(
            files=[{"path": "x.md", "content": "from tool\n"}],
            runtime=runtime,
        )


def test_readonly_session_rejects_writes(data_dir) -> None:
    session = _session(data_dir, _sample_files(), writable=False)
    blocked = session.write([{"path": "notes.md", "content": "# Notes\n"}])
    assert blocked["ok"] is False
    assert "只读" in blocked["error"]
    assert "notes.md" not in session.files
    blocked_replace = session.search_replace("combat.md", "冲刺", "闪避")
    assert blocked_replace["ok"] is False


def test_search_replace_records_old_new(data_dir) -> None:
    session = _session(data_dir, _sample_files())
    session.read("combat.md")
    result = session.search_replace("combat.md", "冲刺与格挡。", "冲刺、格挡与闪避。")
    assert result["ok"] is True
    assert session.writes[-1]["old"] == "冲刺与格挡。"
    assert session.writes[-1]["new"] == "冲刺、格挡与闪避。"
    assert session.writes[-1]["op"] == "search_replace"


def test_write_records_created_flag(data_dir) -> None:
    session = _session(data_dir, _sample_files())
    session.write([{"path": "notes.md", "content": "# Notes\n"}])
    assert session.writes[-1]["created"] is True
    session.write([{"path": "notes.md", "content": "# Notes\n\nmore\n"}])
    assert session.writes[-1]["created"] is False


def test_normalize_file_refs_keeps_replace_preview() -> None:
    refs = normalize_file_refs(
        writes=[
            {"path": "a.md", "op": "write", "created": True},
            {"path": "b.md", "op": "search_replace", "old": "旧句", "new": "新句"},
        ]
    )
    by_path = {r["path"]: r for r in refs}
    assert by_path["a.md"]["created"] is True
    assert by_path["a.md"]["op"] == "write"
    assert by_path["b.md"]["op"] == "search_replace"
    assert by_path["b.md"]["old"] == "旧句"
    assert by_path["b.md"]["new"] == "新句"


@pytest.mark.asyncio
async def test_run_tool_node_writes_and_patches_state(data_dir) -> None:
    from app.agent.tools.node import run_tool_node

    _session(data_dir, _sample_files())
    messages, extra, results = await run_tool_node(
        {
            "project_id": "proj_ws",
            "mode": "",
            "read_paths": [],
            "listed_dirs": [],
            "workspace_writes": [],
        },
        [workspace_write],
        [
            {
                "id": "c_write",
                "name": "workspace_write",
                "args": {"files": [{"path": "from_node.md", "content": "# Node\n"}]},
                "type": "tool_call",
            }
        ],
    )
    assert results[0]["ok"] is True
    assert messages[0].tool_call_id == "c_write"
    assert any(item.get("path") == "from_node.md" for item in extra.get("workspace_writes") or [])
    assert "from_node.md" in (extra.get("read_paths") or [])
    assert "# Node" in load_workspace("proj_ws")["from_node.md"]
    refs = normalize_file_refs(
        writes=[
            {"path": "a.md", "op": "write", "created": True},
            {"path": "b.md", "op": "search_replace", "old": "旧句", "new": "新句"},
        ]
    )
    by_path = {r["path"]: r for r in refs}
    assert by_path["a.md"]["created"] is True
    assert by_path["a.md"]["op"] == "write"
    assert by_path["b.md"]["op"] == "search_replace"
    assert by_path["b.md"]["old"] == "旧句"
    assert by_path["b.md"]["new"] == "新句"
