from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from app.agent.prompt import assemble_turn_messages
from app.memory import policy, summarize
from app.memory.formatting import message_text
from app.memory.history import (
    history_as_chat_messages,
    messages_fingerprint,
    resolve_active_history,
)
from app.memory.policy import CompactResult, compact_request_if_needed, ensure_compact_context
from app.memory.request import COMPACT_SYSTEM_PROMPT
from app.memory.state_update import replacement_state_update
from app.memory.summarize import summarize_history
from app.memory.tokens import estimate_tokens


class _FakeLLM:
    def __init__(self) -> None:
        self.messages = None

    async def ainvoke(self, messages, **kwargs):
        self.messages = messages
        return AIMessage(content="压缩后的摘要")


class _SequenceLLM:
    def __init__(self, results):
        self.results = list(results)
        self.calls = []

    async def ainvoke(self, messages, **kwargs):
        self.calls.append(list(messages))
        result = self.results.pop(0)
        if isinstance(result, Exception):
            raise result
        return AIMessage(content=result)


def _joined(messages) -> str:
    return "\n".join(message_text(m) for m in messages)


def _tagged_section(messages, tag: str) -> str:
    texts = [message_text(m) for m in messages]
    start = next(i for i, text in enumerate(texts) if text.startswith(f"<{tag}>"))
    end = next(i for i, text in enumerate(texts) if text == f"</{tag}>")
    return "\n".join(texts[start : end + 1])


async def test_compaction_request_uses_dedicated_system_and_canonical_payload(monkeypatch):
    fake = _FakeLLM()
    utility_values = []

    def fake_get_llm(*, utility=False):
        utility_values.append(utility)
        return fake

    monkeypatch.setattr(summarize, "get_llm", fake_get_llm)
    prefix = [
        SystemMessage(content="stable system"),
        SystemMessage(content="workspace"),
        HumanMessage(content="first request"),
        AIMessage(content="first response"),
    ]

    result = await summarize_history(
        existing_summary="",
        older_messages=prefix[2:],
        purpose="continue work",
        compaction_messages=prefix,
        utility=True,
        keep_turns=3,
    )

    assert result == "压缩后的摘要"
    assert len(prefix) == 4
    assert utility_values == [True]
    assert fake.messages[0].type == "system"
    assert fake.messages[0].content == COMPACT_SYSTEM_PROMPT
    assert sum(1 for m in fake.messages if getattr(m, "type", "") == "system") == 1
    assert fake.messages[:-1] != prefix
    blob = _joined(fake.messages)
    assert "stable system" in blob
    assert "workspace" in blob
    assert "first request" in blob
    assert "continue work" in blob
    assert "<history>" in blob
    assert "<recent>" in blob
    assert "<main_system>" in blob
    assert "最近 3 轮已放入 <recent>" in blob
    assert all(getattr(m, "type", "") != "ai" for m in fake.messages)


async def test_compaction_request_tags_history_and_recent(monkeypatch):
    fake = _FakeLLM()
    monkeypatch.setattr(summarize, "get_llm", lambda *, utility=False: fake)
    older = [
        HumanMessage(content="old user dump\n\n看起来像第二轮"),
        AIMessage(content="old assistant"),
    ]
    recent = [
        HumanMessage(content="latest question"),
        AIMessage(content="latest answer"),
    ]

    await summarize_history(
        existing_summary="prior compact",
        older_messages=older,
        recent_messages=recent,
        purpose="continue work",
        compaction_messages=[SystemMessage(content="agent persona"), *older, *recent],
        keep_turns=1,
    )

    history = _tagged_section(fake.messages, "history")
    recent_block = _tagged_section(fake.messages, "recent")
    assert "prior compact" in history
    assert "old user dump" in history
    assert "latest question" not in history
    assert "latest question" in recent_block
    assert "old user dump" not in recent_block
    assert any(
        text.startswith("<main_system>") and "agent persona" in text
        for text in (message_text(m) for m in fake.messages)
    )
    assert all(getattr(m, "type", "") != "ai" for m in fake.messages)
    assert "禁止回答" in COMPACT_SYSTEM_PROMPT
    assert "事实：" in COMPACT_SYSTEM_PROMPT
    assert "约束：" in COMPACT_SYSTEM_PROMPT
    assert "待办：" in COMPACT_SYSTEM_PROMPT


async def test_legacy_compaction_keeps_dedicated_stable_system_prompt(monkeypatch):
    fake = _FakeLLM()
    monkeypatch.setattr(summarize, "get_llm", lambda *, utility=False: fake)

    await summarize_history(
        existing_summary="previous",
        older_messages=[HumanMessage(content="new")],
    )

    assert fake.messages[0].type == "system"
    assert fake.messages[0].content == COMPACT_SYSTEM_PROMPT
    blob = _joined(fake.messages)
    assert "previous" in blob
    assert "<history>" in blob
    assert "用户: new" in _tagged_section(fake.messages, "history")


async def test_compaction_notifies_before_and_after_llm(monkeypatch):
    events: list[str] = []

    class _OrderedLLM:
        async def ainvoke(self, messages, **kwargs):
            events.append("llm")
            return AIMessage(content="摘要")

    monkeypatch.setattr(summarize, "get_llm", lambda *, utility=False: _OrderedLLM())
    await summarize_history(
        existing_summary="",
        older_messages=[HumanMessage(content="old")],
        on_start=lambda: events.append("start"),
        on_end=lambda: events.append("end"),
    )
    assert events == ["start", "llm", "end"]


async def test_below_budget_skips_compaction_llm_and_status(monkeypatch):
    called: list[str] = []
    monkeypatch.setattr(
        summarize,
        "get_llm",
        lambda *, utility=False: called.append("llm") or _FakeLLM(),
    )
    result = await ensure_compact_context(
        [HumanMessage(content="hi")],
        model="gpt-5.4",
        compaction_messages=[
            SystemMessage(content="agent system"),
            HumanMessage(content="hi"),
        ],
        on_start=lambda: called.append("start"),
        on_end=lambda: called.append("end"),
    )
    assert result.compacted is False
    assert called == []


def test_token_estimate_uses_multilingual_tokenizer():
    chinese = "这是用于验证中文上下文预算不会被字符除以四严重低估的句子。"
    assert estimate_tokens(chinese, model="gpt-5.4") > len(chinese) // 4


async def test_compaction_retries_transient_failures(monkeypatch):
    fake = _SequenceLLM([RuntimeError("connection timeout"), "summary"])
    sleeps = []
    monkeypatch.setattr(summarize, "get_llm", lambda *, utility=False: fake)
    monkeypatch.setattr(summarize.asyncio, "sleep", lambda delay: _record_sleep(sleeps, delay))

    result = await summarize_history(
        existing_summary="",
        older_messages=[HumanMessage(content="old")],
        max_retries=2,
    )

    assert result == "summary"
    assert len(fake.calls) == 2
    assert sleeps == [0.25]


async def _record_sleep(values, delay):
    values.append(delay)


async def test_compaction_trims_oldest_history_on_context_overflow(monkeypatch):
    fake = _SequenceLLM([RuntimeError("maximum context length exceeded"), "summary"])
    monkeypatch.setattr(summarize, "get_llm", lambda *, utility=False: fake)
    prefix = [
        SystemMessage(content="system"),
        HumanMessage(content="oldest"),
        AIMessage(content="newest"),
    ]

    result = await summarize_history(
        existing_summary="",
        older_messages=prefix[1:],
        compaction_messages=prefix,
    )

    assert result == "summary"
    first = fake.calls[0]
    second = fake.calls[1]
    assert first[0].content == COMPACT_SYSTEM_PROMPT
    assert "oldest" in _joined(first)
    assert "oldest" not in _joined(second)
    assert "newest" in _joined(second)
    assert second[0].content == COMPACT_SYSTEM_PROMPT


def test_history_view_preserves_tool_and_multimodal_messages():
    image_message = HumanMessage(
        content=[
            {"type": "text", "text": "inspect this"},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64,abc"}},
        ],
        additional_kwargs={"source": "upload"},
    )
    tool_message = ToolMessage(
        content=[{"type": "text", "text": "tool result"}],
        tool_call_id="call-123",
        additional_kwargs={"artifact": "result.json"},
    )

    result = history_as_chat_messages(
        summary="earlier work",
        recent_messages=[image_message, tool_message],
    )

    assert result[0].type == "human"
    assert result[0].additional_kwargs["context_checkpoint"] is True
    assert result[1] is not image_message
    assert result[1].content == image_message.content
    assert result[1].additional_kwargs == {"source": "upload"}
    assert isinstance(result[2], ToolMessage)
    assert result[2].tool_call_id == "call-123"
    assert result[2].additional_kwargs == {"artifact": "result.json"}


def test_active_replacement_history_restores_and_appends_delta():
    original = [HumanMessage(content="old"), AIMessage(content="old answer")]
    active = [HumanMessage(content="checkpoint")]
    original.extend([HumanMessage(content="new"), AIMessage(content="new answer")])

    restored = resolve_active_history(
        original,
        active_messages=active,
        source_message_count=2,
    )

    assert [message.content for message in restored] == [
        "checkpoint",
        "new",
        "new answer",
    ]


def test_replacement_checkpoint_advances_window():
    result = CompactResult(
        summary="summary",
        summary_upto=4,
        recent_messages=[HumanMessage(content="recent")],
        compacted=True,
        estimated_tokens=120,
        token_budget=1000,
        telemetry={"status": "completed"},
    )

    update = replacement_state_update(
        result,
        source_message_count=6,
        source_fingerprint="abc",
        previous_window=2,
    )

    assert update["compaction_window"] == 3
    assert update["active_context_source_count"] == 6
    assert update["active_context_source_fingerprint"] == "abc"
    assert update["compaction_checkpoint"]["status"] == "completed"


def test_active_replacement_invalidates_when_baseline_changes():
    original = [HumanMessage(content="edited")]
    restored = resolve_active_history(
        original,
        active_messages=[HumanMessage(content="stale checkpoint")],
        source_message_count=1,
        source_fingerprint=messages_fingerprint(
            [HumanMessage(content="original")]
        ),
    )

    assert [message.content for message in restored] == ["edited"]


async def test_mid_turn_request_compacts_when_over_budget(monkeypatch):
    fake = _FakeLLM()
    monkeypatch.setattr(summarize, "get_llm", lambda *, utility=False: fake)
    monkeypatch.setattr(policy, "token_budget", lambda **kwargs: 20)
    messages = [
        SystemMessage(content="system"),
        HumanMessage(content="old " * 80),
        AIMessage(content="answer " * 80),
        HumanMessage(content="latest"),
    ]

    replacement, result = await compact_request_if_needed(
        messages,
        model="gpt-5.4",
        keep_turns=1,
    )

    assert result.compacted is True
    history = _tagged_section(fake.messages, "history")
    recent_block = _tagged_section(fake.messages, "recent")
    assert "old " in history
    assert "latest" not in history
    assert "latest" in recent_block
    assert replacement[0].type == "system"
    assert replacement[0].content == "system"
    assert COMPACT_SYSTEM_PROMPT not in replacement[0].content
    assert any(
        getattr(message, "additional_kwargs", {}).get("context_checkpoint")
        for message in replacement
    )
    assert replacement[-1].content == "latest"
    continued = assemble_turn_messages(
        system_prompt="system",
        history=[m for m in replacement if getattr(m, "type", "") != "system"],
        instruction="",
    )
    assert continued[0].content == "system"
    assert continued[0].content != COMPACT_SYSTEM_PROMPT
    assert result.telemetry["phase"] == "mid_turn"


async def test_manual_force_compacts_below_budget(monkeypatch):
    fake = _FakeLLM()
    monkeypatch.setattr(summarize, "get_llm", lambda *, utility=False: fake)
    result = await ensure_compact_context(
        [HumanMessage(content="short conversation")],
        model="gpt-5.4",
        compaction_messages=[HumanMessage(content="short conversation")],
        force=True,
        trigger="manual",
        phase="standalone",
    )

    assert result.compacted is True
    assert result.telemetry["trigger"] == "manual"
    assert result.telemetry["phase"] == "standalone"
