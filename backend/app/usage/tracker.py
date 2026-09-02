"""LLM usage capture via LangChain callbacks.

Each graph run gets a UsageCallbackHandler attached through RunnableConfig.
Every LLM call is persisted with project / conversation / turn / model so the
UI can show per-turn, per-conversation, per-project, and aggregated analytics.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Optional
from uuid import UUID

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, LLMResult

from .tags import call_tags, tools_invoked, tools_offered


def new_turn_id() -> str:
    return f"turn_{uuid.uuid4().hex[:12]}"


def _as_int(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _cache_tokens(mapping: dict | None) -> tuple[int, int]:
    if not isinstance(mapping, dict):
        return 0, 0
    details = (
        mapping.get("input_token_details")
        or mapping.get("prompt_tokens_details")
        or mapping.get("input_tokens_details")
        or {}
    )
    read = _as_int(
        mapping.get("cache_read_input_tokens")
        or mapping.get("cached_tokens")
        or (details.get("cache_read") if isinstance(details, dict) else 0)
        or (details.get("cached_tokens") if isinstance(details, dict) else 0)
    )
    write = _as_int(
        mapping.get("cache_creation_input_tokens")
        or mapping.get("cache_write_input_tokens")
        or mapping.get("cache_write_tokens")
        or (details.get("cache_write") if isinstance(details, dict) else 0)
    )
    return read, write


def _extract_usage(
    message: BaseMessage | None, llm_output: dict | None
) -> tuple[int, int, str, int, int]:
    """Return input/output/model plus prompt-cache read/write tokens."""
    input_tokens = 0
    output_tokens = 0
    model = ""
    cache_read_tokens = 0
    cache_write_tokens = 0

    usage = getattr(message, "usage_metadata", None) if message is not None else None
    if isinstance(usage, dict):
        input_tokens = _as_int(usage.get("input_tokens") or usage.get("prompt_tokens"))
        output_tokens = _as_int(usage.get("output_tokens") or usage.get("completion_tokens"))
        cache_read_tokens, cache_write_tokens = _cache_tokens(usage)
    elif usage is not None:
        input_tokens = _as_int(getattr(usage, "input_tokens", None) or getattr(usage, "prompt_tokens", None))
        output_tokens = _as_int(getattr(usage, "output_tokens", None) or getattr(usage, "completion_tokens", None))

    if message is not None:
        meta = getattr(message, "response_metadata", None) or {}
        if isinstance(meta, dict):
            model = str(meta.get("model_name") or meta.get("model") or "")
            token_usage = meta.get("token_usage") or meta.get("usage") or {}
            if isinstance(token_usage, dict):
                read, write = _cache_tokens(token_usage)
                cache_read_tokens = cache_read_tokens or read
                cache_write_tokens = cache_write_tokens or write
                if not input_tokens:
                    input_tokens = _as_int(token_usage.get("prompt_tokens") or token_usage.get("input_tokens"))
                if not output_tokens:
                    output_tokens = _as_int(
                        token_usage.get("completion_tokens") or token_usage.get("output_tokens")
                    )

    if llm_output:
        if not model:
            model = str(llm_output.get("model_name") or llm_output.get("model") or "")
        token_usage = llm_output.get("token_usage") or llm_output.get("usage") or {}
        if isinstance(token_usage, dict):
            read, write = _cache_tokens(token_usage)
            cache_read_tokens = cache_read_tokens or read
            cache_write_tokens = cache_write_tokens or write
            if not input_tokens:
                input_tokens = _as_int(token_usage.get("prompt_tokens") or token_usage.get("input_tokens"))
            if not output_tokens:
                output_tokens = _as_int(
                    token_usage.get("completion_tokens") or token_usage.get("output_tokens")
                )

    return input_tokens, output_tokens, model, cache_read_tokens, cache_write_tokens


def _estimate_from_text(prompt_hint: str, completion: str) -> tuple[int, int]:
    """Rough token estimate when providers omit usage (e.g. some proxies)."""
    # ~4 chars per token for mixed CN/EN — good enough for display.
    inp = max(1, len(prompt_hint) // 4) if prompt_hint else 0
    out = max(1, len(completion) // 4) if completion else 0
    return inp, out


INPUT_CATEGORIES = ("system", "rules", "tools", "conversation", "other")


def _text_tokens(value: Any, model: str = "") -> int:
    """Estimate a payload fragment with the same tokenizer used by context UI."""
    if value is None:
        return 0
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    if not text:
        return 0
    try:
        from app.memory.tokens import estimate_tokens

        return estimate_tokens(text, model=model)
    except Exception:
        return max(1, len(text) // 4)


def _message_category(message: BaseMessage) -> str:
    kind = str(getattr(message, "type", "") or "").lower()
    if kind in {"system", "developer"}:
        return "system"
    if kind == "tool":
        return "tools"
    return "conversation"


def _message_text(message: BaseMessage) -> str:
    content = getattr(message, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict):
                parts.append(str(block.get("text") or ""))
            else:
                parts.append(str(block))
        return "".join(parts)
    return str(content or "")


def _add_message_tokens(breakdown: dict[str, int], message: BaseMessage, model: str) -> None:
    category = _message_category(message)
    if category == "system":
        from app.rules import split_system_and_rules

        system_text, rules_text = split_system_and_rules(_message_text(message))
        if rules_text:
            breakdown["system"] += _text_tokens(system_text, model)
            breakdown["rules"] += _text_tokens(rules_text, model)
            return
    breakdown[category] += _text_tokens(
        {
            "content": getattr(message, "content", ""),
            "tool_calls": getattr(message, "tool_calls", None),
            "name": getattr(message, "name", None),
        },
        model,
    )


def _reconcile_breakdown(estimated: dict[str, int], actual_total: int) -> dict[str, int]:
    """Scale estimated components so they add up to provider-reported input."""
    actual_total = max(0, int(actual_total or 0))
    clean = {key: max(0, int(estimated.get(key, 0))) for key in INPUT_CATEGORIES}
    estimate_total = sum(clean.values())
    if actual_total == 0:
        return {key: 0 for key in INPUT_CATEGORIES}
    if estimate_total == 0:
        return {**{key: 0 for key in INPUT_CATEGORIES}, "other": actual_total}
    raw = {key: clean[key] * actual_total / estimate_total for key in INPUT_CATEGORIES}
    result = {key: int(raw[key]) for key in INPUT_CATEGORIES}
    remainder = actual_total - sum(result.values())
    order = sorted(INPUT_CATEGORIES, key=lambda key: raw[key] - result[key], reverse=True)
    for key in order[:remainder]:
        result[key] += 1
    return result


class UsageCallbackHandler(BaseCallbackHandler):
    """Persist each LLM call and keep an in-memory total for the current turn."""

    raise_error = False

    def __init__(
        self,
        *,
        project_id: str,
        conversation_id: str,
        turn_id: str,
        default_model: str = "",
        mode: str = "",
    ) -> None:
        super().__init__()
        self.project_id = project_id
        self.conversation_id = conversation_id
        self.turn_id = turn_id
        self.default_model = default_model
        self.mode = mode or ""
        self._prompt_chars: dict[UUID, int] = {}
        self._input_estimates: dict[UUID, dict[str, int]] = {}
        self._recorded_runs: set[UUID] = set()
        self._pending: dict[UUID, dict[str, Any]] = {}
        self.turn_input_tokens = 0
        self.turn_output_tokens = 0
        self.turn_cache_read_tokens = 0
        self.turn_cache_write_tokens = 0
        self.turn_provider_calls = 0
        self.turn_estimated_calls = 0
        self.turn_input_breakdown = {key: 0 for key in INPUT_CATEGORIES}
        self.turn_calls = 0
        self.by_model: dict[str, dict[str, float | int]] = {}
        self._last_call: dict[str, Any] | None = None

    def start_turn(self) -> None:
        pass

    def end_turn(self) -> None:
        self._pending.clear()

    def _remember_llm_call(
        self,
        run_id: UUID,
        *,
        tool_defs: Any,
        kwargs: dict[str, Any],
    ) -> None:
        if run_id in self._pending:
            return
        offered = tools_offered(tool_defs)
        tags = call_tags(
            mode=self.mode,
            role=self._role_from_kwargs(kwargs),
            raw_tags=kwargs.get("tags") or [],
        )
        self._pending[run_id] = {
            "offered": offered,
            "tags": tags,
        }

    def on_chat_model_start(
        self,
        serialized: dict[str, Any],
        messages: list[list[BaseMessage]],
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        chars = 0
        breakdown = {key: 0 for key in INPUT_CATEGORIES}
        flat: list[BaseMessage] = []
        for batch in messages:
            for msg in batch:
                flat.append(msg)
                content = getattr(msg, "content", "")
                if isinstance(content, str):
                    chars += len(content)
                elif isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict):
                            chars += len(str(block.get("text") or ""))
                        else:
                            chars += len(str(block))
                _add_message_tokens(breakdown, msg, self.default_model)
        invocation = kwargs.get("invocation_params") or {}
        tool_defs = invocation.get("tools") or invocation.get("functions") or []
        breakdown["tools"] += _text_tokens(tool_defs, self.default_model)
        self._prompt_chars[run_id] = chars
        self._input_estimates[run_id] = breakdown
        try:
            self._remember_llm_call(run_id, tool_defs=tool_defs, kwargs=kwargs)
        except Exception:
            pass

    def on_llm_start(
        self,
        serialized: dict[str, Any],
        prompts: list[str],
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        self._prompt_chars[run_id] = sum(len(p or "") for p in prompts)
        self._input_estimates[run_id] = {
            "system": 0,
            "rules": 0,
            "tools": 0,
            "conversation": sum(_text_tokens(p, self.default_model) for p in prompts),
            "other": 0,
        }
        if run_id in self._pending:
            return
        try:
            invocation = kwargs.get("invocation_params") or {}
            tool_defs = invocation.get("tools") or invocation.get("functions") or []
            self._remember_llm_call(run_id, tool_defs=tool_defs, kwargs=kwargs)
        except Exception:
            pass

    def on_llm_end(self, response: LLMResult, *, run_id: UUID, **kwargs: Any) -> None:
        if run_id in self._recorded_runs:
            return
        message: AIMessage | None = None
        completion = ""
        for gens in response.generations or []:
            for gen in gens:
                if isinstance(gen, ChatGeneration) and isinstance(gen.message, AIMessage):
                    message = gen.message
                    content = gen.message.content
                    completion = content if isinstance(content, str) else str(content or "")
                    break
            if message:
                break

        llm_output = response.llm_output if isinstance(response.llm_output, dict) else {}
        input_tokens, output_tokens, model, cache_read, cache_write = _extract_usage(
            message, llm_output
        )

        usage_source = "provider"
        if input_tokens == 0 and output_tokens == 0:
            prompt_hint = "x" * self._prompt_chars.get(run_id, 0)
            input_tokens, output_tokens = _estimate_from_text(prompt_hint, completion)
            usage_source = "estimated"

        model = model or self.default_model or "unknown"
        role = self._role_from_kwargs(kwargs)
        self._record(
            run_id=run_id,
            model=model,
            role=role,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=cache_read,
            cache_write_tokens=cache_write,
            usage_source=usage_source,
            input_breakdown=_reconcile_breakdown(
                self._input_estimates.get(run_id, {}), input_tokens
            ),
            message=message,
            kwargs=kwargs,
        )

    def on_chat_model_end(self, response: BaseMessage, *, run_id: UUID, **kwargs: Any) -> None:
        # Chat models may emit usage here (esp. streaming). Dedupe with on_llm_end via run_id.
        if run_id in self._recorded_runs:
            return
        if not isinstance(response, AIMessage):
            return
        input_tokens, output_tokens, model, cache_read, cache_write = _extract_usage(
            response, None
        )
        usage_source = "provider"
        content = response.content
        completion = content if isinstance(content, str) else str(content or "")
        if input_tokens == 0 and output_tokens == 0:
            prompt_hint = "x" * self._prompt_chars.get(run_id, 0)
            input_tokens, output_tokens = _estimate_from_text(prompt_hint, completion)
            usage_source = "estimated"

        model = model or self.default_model or "unknown"
        role = self._role_from_kwargs(kwargs)
        self._record(
            run_id=run_id,
            model=model,
            role=role,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=cache_read,
            cache_write_tokens=cache_write,
            usage_source=usage_source,
            input_breakdown=_reconcile_breakdown(
                self._input_estimates.get(run_id, {}), input_tokens
            ),
            message=response,
            kwargs=kwargs,
        )

    def on_llm_error(self, error: BaseException, *, run_id: UUID, **kwargs: Any) -> None:
        self._fail_llm(run_id)

    def on_chat_model_error(self, error: BaseException, *, run_id: UUID, **kwargs: Any) -> None:
        self._fail_llm(run_id)

    def _fail_llm(self, run_id: UUID) -> None:
        if run_id in self._recorded_runs:
            return
        self._pending.pop(run_id, None)
        self._recorded_runs.add(run_id)

    @staticmethod
    def _role_from_kwargs(kwargs: dict[str, Any]) -> str:
        metadata = kwargs.get("metadata") or {}
        role = str(metadata.get("role") or metadata.get("langgraph_node") or "")
        for tag in kwargs.get("tags") or []:
            if isinstance(tag, str) and tag.startswith("role:"):
                return tag.split(":", 1)[1]
        return role

    def _record(
        self,
        *,
        run_id: Optional[UUID],
        model: str,
        role: str,
        input_tokens: int,
        output_tokens: int,
        cache_read_tokens: int = 0,
        cache_write_tokens: int = 0,
        usage_source: str = "provider",
        input_breakdown: dict[str, int] | None = None,
        message: AIMessage | None = None,
        kwargs: dict[str, Any] | None = None,
    ) -> None:
        pending = self._pending.pop(run_id, None) if run_id is not None else None
        offered: list[dict[str, Any]] = list((pending or {}).get("offered") or [])
        invoked = tools_invoked(getattr(message, "tool_calls", None) if message else None)
        raw_tags = list((kwargs or {}).get("tags") or [])
        raw_tags.extend((pending or {}).get("tags") or [])
        tags = call_tags(
            mode=self.mode,
            role=role,
            raw_tags=raw_tags,
        )

        if run_id is not None:
            if run_id in self._recorded_runs:
                return
            self._recorded_runs.add(run_id)
            self._prompt_chars.pop(run_id, None)
            self._input_estimates.pop(run_id, None)

        if input_tokens <= 0 and output_tokens <= 0:
            return

        try:
            from ..store import db

            db.insert_usage(
                project_id=self.project_id,
                conversation_id=self.conversation_id,
                turn_id=self.turn_id,
                model=model,
                role=role,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cache_read_tokens=cache_read_tokens,
                cache_write_tokens=cache_write_tokens,
                usage_source=usage_source,
                input_breakdown=input_breakdown or {},
                tags=tags,
                tools_offered=offered,
                tools_invoked=invoked,
            )
        except Exception:
            pass

        self.turn_input_tokens += input_tokens
        self.turn_output_tokens += output_tokens
        self.turn_cache_read_tokens += cache_read_tokens
        self.turn_cache_write_tokens += cache_write_tokens
        self.turn_provider_calls += int(usage_source == "provider")
        self.turn_estimated_calls += int(usage_source == "estimated")
        for key in INPUT_CATEGORIES:
            self.turn_input_breakdown[key] += int((input_breakdown or {}).get(key, 0))
        self.turn_calls += 1
        self._last_call = {
            "model": model,
            "role": role,
            "input_tokens": input_tokens,
            "usage_source": usage_source,
            "input_breakdown": dict(input_breakdown or {}),
        }
        bucket = self.by_model.setdefault(
            model,
            {"input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0, "cache_write_tokens": 0, "calls": 0},
        )
        bucket["input_tokens"] = int(bucket["input_tokens"]) + input_tokens
        bucket["output_tokens"] = int(bucket["output_tokens"]) + output_tokens
        bucket["cache_read_tokens"] = int(bucket["cache_read_tokens"]) + cache_read_tokens
        bucket["cache_write_tokens"] = int(bucket["cache_write_tokens"]) + cache_write_tokens
        bucket["calls"] = int(bucket["calls"]) + 1

    def latest_context_call(self) -> dict[str, Any] | None:
        """Last recorded call, shaped for ``context_usage_from_call``.

        Lets the SSE stream report context-window occupancy without a database
        read, so the UI never has to poll the ``context-usage`` route mid-turn.
        """
        return dict(self._last_call) if self._last_call else None

    def turn_summary(self) -> dict[str, Any]:
        return {
            "turn_id": self.turn_id,
            "input_tokens": self.turn_input_tokens,
            "output_tokens": self.turn_output_tokens,
            "cache_read_tokens": self.turn_cache_read_tokens,
            "cache_write_tokens": self.turn_cache_write_tokens,
            "total_tokens": self.turn_input_tokens + self.turn_output_tokens,
            "calls": self.turn_calls,
            "provider_calls": self.turn_provider_calls,
            "estimated_calls": self.turn_estimated_calls,
            "input_breakdown": dict(self.turn_input_breakdown),
            "by_model": [
                {
                    "model": name,
                    "input_tokens": int(vals["input_tokens"]),
                    "output_tokens": int(vals["output_tokens"]),
                    "cache_read_tokens": int(vals["cache_read_tokens"]),
                    "cache_write_tokens": int(vals["cache_write_tokens"]),
                    "total_tokens": int(vals["input_tokens"]) + int(vals["output_tokens"]),
                    "calls": int(vals["calls"]),
                }
                for name, vals in sorted(self.by_model.items())
            ],
        }


def empty_usage_bucket() -> dict[str, Any]:
    return {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_tokens": 0,
        "cache_write_tokens": 0,
        "total_tokens": 0,
        "calls": 0,
        "provider_calls": 0,
        "estimated_calls": 0,
        "input_breakdown": {key: 0 for key in INPUT_CATEGORIES},
        "by_model": [],
    }
