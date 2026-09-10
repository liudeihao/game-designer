"""Immutable illustration records, place, stale hint, generate gate."""

from __future__ import annotations

import pytest

from app.docs import ensure_seeded, write_files
from app.image.client import ImageNotConfiguredError
from app.illustrations.service import (
    IllustrationError,
    generate_illustration,
    get_record,
    list_illustrations,
    place_illustration,
)
from app.illustrations.store import is_stale, public_record, write_record


@pytest.fixture
def project_id(data_dir):
    pid = "proj_illust"
    ensure_seeded(pid)
    write_files(pid, {"角色设计.md": "# 角色\n黑发剑士。\n"}, {})
    return pid


def _png() -> bytes:
    return b"\x89PNG\r\n\x1a\n" + b"fake"


def test_place_does_not_rewrite_prompt(project_id):
    stored = write_record(
        project_id,
        {
            "id": "ill_fixed",
            "prompt": "original prompt",
            "extras": "fog",
            "style_used": False,
            "style_text": "",
            "linked_doc": None,
            "linked_rev": None,
            "draft": True,
            "created_at": "2026-01-01T00:00:00+00:00",
            "conversation_id": None,
        },
        _png(),
        "png",
    )
    assert stored["prompt"] == "original prompt"
    placed = place_illustration(project_id, "ill_fixed", home="doc", linked_doc="角色设计.md")
    assert placed["prompt"] == "original prompt"
    assert placed["extras"] == "fog"
    assert placed["home"] == "doc"
    assert placed["linked_doc"] == "角色设计.md"
    assert placed["draft"] is False
    again = get_record(project_id, "ill_fixed")
    assert again is not None
    assert again["prompt"] == "original prompt"


def test_stale_when_linked_doc_rev_moves(project_id):
    write_record(
        project_id,
        {
            "id": "ill_old",
            "prompt": "a knight",
            "extras": "",
            "style_used": False,
            "style_text": "",
            "linked_doc": "角色设计.md",
            "linked_rev": 1,
            "draft": False,
            "created_at": "2026-01-01T00:00:00+00:00",
        },
        _png(),
        "png",
    )
    raw = {
        "id": "ill_old",
        "linked_doc": "角色设计.md",
        "linked_rev": 1,
        "draft": False,
    }
    assert is_stale(raw, project_id) is False
    write_files(project_id, {"角色设计.md": "# 角色\n改过了。\n"}, {"角色设计.md": 1})
    assert is_stale(raw, project_id) is True
    pub = public_record({**raw, "prompt": "a knight"}, project_id)
    assert pub["stale"] is True
    draft = {"id": "x", "draft": True, "linked_doc": "角色设计.md", "linked_rev": 1}
    assert is_stale(draft, project_id) is False
    unbound = {"id": "y", "draft": False, "linked_doc": None, "linked_rev": None}
    assert is_stale(unbound, project_id) is False


@pytest.mark.asyncio
async def test_generate_without_image_provider_raises(project_id, monkeypatch):
    import app.illustrations.service as svc

    async def fake_compile(*_a, **_k):
        return {
            "prompt": "a knight",
            "extras": "",
            "style_used": False,
            "style_text": "",
            "linked_doc": None,
            "blurb": "",
            "use_style": False,
        }

    monkeypatch.setattr(svc, "compile_prompt", fake_compile)

    def _no_image(_prompt: str):
        raise ImageNotConfiguredError("未配置生图模型。请在设置 → 图像模型中填写 Key 并选择模型。")

    monkeypatch.setattr(svc, "generate_image_bytes", _no_image)

    with pytest.raises(IllustrationError, match="未配置生图"):
        await generate_illustration(project_id, prompt="a knight", home="unbound")


@pytest.mark.asyncio
async def test_generate_writes_immutable_record(project_id, monkeypatch):
    import app.illustrations.service as svc

    async def fake_compile(*_a, **_k):
        return {
            "prompt": "final prompt text",
            "extras": "more fog",
            "style_used": True,
            "style_text": "ink",
            "linked_doc": "角色设计.md",
            "blurb": "黑发剑士",
            "use_style": True,
        }

    monkeypatch.setattr(svc, "compile_prompt", fake_compile)
    monkeypatch.setattr(svc, "generate_image_bytes", lambda _p: (_png(), "png"))

    rec = await generate_illustration(
        project_id,
        prompt="final prompt text",
        extras="more fog",
        home="doc",
        linked_doc="角色设计.md",
    )
    assert rec["prompt"] == "final prompt text"
    assert rec["home"] == "doc"
    rows = list_illustrations(project_id, linked_doc="角色设计.md")
    assert len(rows) == 1
    assert rows[0]["prompt"] == "final prompt text"
    placed = place_illustration(project_id, rec["id"], home="unbound")
    assert placed["prompt"] == "final prompt text"
    assert placed["linked_doc"] is None
