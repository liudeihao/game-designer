"""Pending User Choice payloads reconstructed from live tool args."""

from app.conversations.ui_timeline import pending_from_tool_args


def test_pending_from_suggest_mode_args() -> None:
    pend = pending_from_tool_args(
        "suggest_mode",
        {"mode": "plan", "message": "范围太大"},
    )
    assert pend is not None
    assert pend["type"] == "user_choice"
    assert pend["variant"] == "suggest_mode"
    assert pend["mode"] == "plan"
    assert pend["message"] == "范围太大"


def test_pending_from_ask_user_args() -> None:
    pend = pending_from_tool_args(
        "ask_user",
        {"message": "选一个", "questions": [{"id": "a", "prompt": "方向？"}]},
    )
    assert pend is not None
    assert pend["variant"] == "questions"
