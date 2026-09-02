"""Live SSE envelope tests. Workspace writes persist inside the tool call, not at stream end."""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import patch

import pytest

from app.api.stream import sse, stream_run, wrap_frame


def test_wrap_frame_nests_original_payload() -> None:
    payload = {"text": "我", "node": "main_agent"}
    frame = wrap_frame("token", payload, turn_id="turn_abc", frame_id="frm_1", ts=1)
    assert frame == {
        "id": "frm_1",
        "turn_id": "turn_abc",
        "type": "token",
        "ts": 1,
        "data": payload,
    }


def test_sse_serializes_envelope_and_keeps_event_name() -> None:
    raw = sse("done", {"pending": None, "messages": []}, turn_id="turn_1", frame_id="frm_d", ts=2)
    assert raw.startswith("event: done\n")
    assert '"turn_id": "turn_1"' in raw
    assert '"type": "done"' in raw
    assert '"pending": null' in raw


def test_activity_and_error_use_the_same_envelope() -> None:
    activity = wrap_frame(
        "activity",
        {"agent": "系统", "kind": "work", "message": "开始"},
        turn_id="turn_x",
        frame_id="frm_a",
        ts=3,
    )
    error = wrap_frame(
        "error",
        {"message": "boom"},
        turn_id="turn_x",
        frame_id="frm_e",
        ts=4,
    )
    assert activity["type"] == "activity"
    assert activity["data"]["message"] == "开始"
    assert error["type"] == "error"
    assert error["data"]["message"] == "boom"
    assert activity["turn_id"] == error["turn_id"]


class _Interrupt:
    def __init__(self, value: Any) -> None:
        self.value = value


class _Task:
    def __init__(self, value: Any) -> None:
        self.interrupts = [_Interrupt(value)]


class _Snapshot:
    def __init__(self, pending: Any = None) -> None:
        self.values = {}
        self.tasks = [_Task(pending)] if pending is not None else []


class _FakeRuntime:
    """Just enough of ConversationRuntime for stream_run."""

    def __init__(self, snapshot: _Snapshot) -> None:
        self._snapshot = snapshot

    def thread_config(self, conversation_id: str) -> dict:
        return {"configurable": {"thread_id": conversation_id}}

    async def astream(self, program, config, stream_mode):
        del program, config, stream_mode
        yield "custom", {"type": "token", "text": "好的", "node": "main_agent"}
        if self._snapshot.tasks:
            yield "updates", {"__interrupt__": [self._snapshot.tasks[0].interrupts[0]]}

    async def load(self, conversation_id: str) -> _Snapshot:
        del conversation_id
        return self._snapshot


def _parse_frames(chunks: list[str]) -> list[dict]:
    frames = []
    for chunk in chunks:
        for block in chunk.strip().split("\n\n"):
            data_line = next(
                line for line in block.split("\n") if line.startswith("data: ")
            )
            frames.append(json.loads(data_line[len("data: ") :]))
    return frames


async def _run(snapshot: _Snapshot) -> list[dict]:
    with (
        patch("app.conversations._runs.load_project_workspace", return_value={"files": {}, "revs": {}}),
        patch("app.conversations._runs.db.usage_scopes", return_value={}),
        patch("app.conversations._runs.db.get_conversation", return_value=None),
        patch("app.conversations._runs.db.touch_project"),
        patch("app.conversations._runs.db.touch_conversation"),
    ):
        chunks = [
            chunk
            async for chunk in stream_run(
                _FakeRuntime(snapshot),
                program={},
                project_id="proj_t",
                conversation_id="conv_t",
                mode="",
            )
        ]
        return _parse_frames(chunks)


@pytest.mark.asyncio
async def test_every_stream_frame_carries_the_envelope() -> None:
    frames = await _run(_Snapshot())
    assert frames, "expected frames"
    turn_ids = {f["turn_id"] for f in frames}
    assert len(turn_ids) == 1 and "" not in turn_ids
    for frame in frames:
        assert set(frame) == {"id", "turn_id", "type", "ts", "data"}
    assert frames[-1]["type"] == "done"


@pytest.mark.asyncio
async def test_pending_user_choice_still_lands_in_done() -> None:
    pending = {"type": "user_choice", "variant": "questions", "questions": []}
    frames = await _run(_Snapshot(pending=pending))
    done = frames[-1]
    assert done["type"] == "done"
    assert done["data"]["pending"] == pending
