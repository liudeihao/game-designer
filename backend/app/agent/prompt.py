"""Assemble a cache-friendly LLM request: stable system + history + this-turn human."""

from __future__ import annotations

from typing import Any, Sequence

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage

UNPAIRED_TOOL_OBSERVATION = (
    "未获得结果：该工具调用没有回包（用户跳过了提问，或较早上下文已被压缩）。"
    "请忽略它，以最新的用户输入为准。"
)


def _tool_call_ids(message: Any) -> list[str]:
    out: list[str] = []
    for call in getattr(message, "tool_calls", None) or []:
        raw = call.get("id") if isinstance(call, dict) else getattr(call, "id", "")
        call_id = str(raw or "")
        if call_id:
            out.append(call_id)
    return out


def repair_tool_call_pairing(history: Sequence[Any]) -> list[Any]:
    """Glue every tool result back to the assistant that asked for it.

    OpenAI-compatible APIs (DeepSeek included) reject the whole request unless
    each ``tool_call_id`` on an assistant message is answered by a ``tool``
    message before any other role appears. A checkpoint can drift from that
    shape for reasons that are legitimate on our side: a held User Choice is
    only answered once the user replies, compaction can cut between an
    assistant and its results, and a new user message can arrive while a Choice
    is still pending. Missing results become a synthetic observation, orphaned
    ones are dropped.
    """
    messages = list(history or [])
    results: dict[str, Any] = {}
    for message in messages:
        if not isinstance(message, ToolMessage):
            continue
        call_id = str(getattr(message, "tool_call_id", "") or "")
        if call_id and call_id not in results:
            results[call_id] = message

    out: list[Any] = []
    answered: set[str] = set()
    for message in messages:
        if isinstance(message, ToolMessage):
            continue  # re-emitted below next to its own assistant, or dropped
        out.append(message)
        for call_id in _tool_call_ids(message):
            if call_id in answered:
                continue
            answered.add(call_id)
            out.append(
                results.get(call_id)
                or ToolMessage(content=UNPAIRED_TOOL_OBSERVATION, tool_call_id=call_id)
            )
    return out


def assemble_turn_messages(
    *,
    system_prompt: str,
    history: Sequence[Any],
    instruction: str = "",
    extra_suffix: str = "",
) -> list[Any]:
    """Stable system prefix, then repaired chat history.

    Dynamic per-turn extras (Plan workspace card, etc.) attach only to the last
    human message so the system prefix stays byte-stable for prompt caches.
    """
    out = repair_tool_call_pairing(history)
    instruction_only = (instruction or "").strip()
    extra = (extra_suffix or "").strip()
    last_human = instruction_only
    if extra:
        last_human = f"{instruction_only}\n\n{extra}".strip() if instruction_only else extra

    last = out[-1] if out else None
    last_text = str(getattr(last, "content", "") or "").strip() if last else ""
    if last_human:
        if last and getattr(last, "type", "") == "human" and last_text == instruction_only:
            if last_text != last_human:
                out = [*out[:-1], HumanMessage(content=last_human)]
        elif not last or getattr(last, "type", "") != "human" or last_text != last_human:
            out.append(HumanMessage(content=last_human))

    return [SystemMessage(content=system_prompt), *out]
