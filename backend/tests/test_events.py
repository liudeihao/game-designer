from app.agent.plan.user_choice import after_user_choice
from app.agent.tools.choice import (
    observation_from_pending,
    pending_from_user_choice_call,
)
from app.agent.tools.deps import PLAN
from app.agent.tools.mode import SUGGEST_MODE_TOOL
from app.conversations.events import (
    rule_proposal_event,
    tool_call_event,
    tool_permission_event,
    tool_result_event,
    user_choice_event,
)
from app.conversations.runtime import ConversationSnapshot


def test_tool_result_outcomes_are_distinguishable() -> None:
    assert tool_result_event(call_id="c1", outcome="success", content="ok")["outcome"] == "success"
    assert tool_result_event(call_id="c1", outcome="error", content="missing")["outcome"] == "error"
    assert tool_result_event(call_id="c1", outcome="reject")["outcome"] == "reject"
    comment = tool_result_event(call_id="c1", outcome="comment", content="先改世界观")
    assert comment["outcome"] == "comment"
    assert comment["content"] == "先改世界观"


def test_rule_proposal_is_not_a_user_choice() -> None:
    event = rule_proposal_event(
        proposal_id="rp1",
        scope="project",
        operation="add",
        name="先说明影响范围",
        details="改文档前先说明影响哪些章节。",
    )
    assert event["type"] == "rule_proposal"
    assert event["status"] == "pending"
    assert event["type"] != "user_choice"


def test_user_choice_is_not_a_tool_call() -> None:
    event = user_choice_event(
        choice_id="ask-1",
        pending={"type": "user_choice", "variant": "questions", "questions": []},
    )
    assert event["type"] == "user_choice"
    assert event["status"] == "pending"


def test_permission_is_per_call() -> None:
    event = tool_permission_event(call_id="w1", status="pending")
    assert event["type"] == "tool_permission"
    assert event["id"] == "w1"


def test_tool_call_event_stamps_after_human() -> None:
    event = tool_call_event(call_id="t1", name="workspace_read", after_human=2)
    assert event["after_human"] == 2


def test_snapshot_exposes_events() -> None:
    view = ConversationSnapshot(
        conversation_id="c1",
        agent_state={
            "events": [tool_call_event(call_id="t1", name="workspace_read", input={"path": "a.md"})],
        },
        pending=None,
    )
    assert view.events[0]["type"] == "tool_call"
    assert view.events[0]["id"] == "t1"


def test_two_user_choice_variants_share_type() -> None:
    questions = pending_from_user_choice_call(
        {
            "name": "ask_user",
            "id": "q1",
            "args": {"message": "选", "questions": [{"id": "a", "prompt": "方向？"}]},
        }
    )
    suggest = pending_from_user_choice_call(
        {"name": SUGGEST_MODE_TOOL, "id": "s1", "args": {"mode": "plan", "message": "建议进 Plan"}}
    )
    assert questions["type"] == suggest["type"] == "user_choice"
    assert questions["variant"] == "questions"
    assert suggest["variant"] == "suggest_mode"
    assert suggest["mode"] == "plan"


def test_suggest_mode_observation_names_the_target() -> None:
    pending = pending_from_user_choice_call(
        {"name": SUGGEST_MODE_TOOL, "id": "s1", "args": {"mode": "plan", "message": "范围大"}}
    )
    text = observation_from_pending(pending, {"action": "switch"})
    assert "Plan" in text
    dismissed = observation_from_pending(pending, {"action": "dismiss"})
    assert "暂不切换" in dismissed


def test_after_user_choice_enter_plan_rebuilds_turn() -> None:
    assert (
        after_user_choice({"mode": PLAN, "turn_scratch": {"rebuild_turn": True}})
        == "turn_setup"
    )
    assert after_user_choice({"turn_request": [object()], "turn_scratch": {}}) == "agent_llm"
