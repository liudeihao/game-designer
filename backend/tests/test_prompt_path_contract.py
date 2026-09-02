"""Prompt path examples must be valid tool arguments.

Prompts and tool schemas are written separately, so a path example that reads
fine to a human (``docs/愿景.md``) can still normalize to a nested directory.
These tests pin the two sides together.
"""

from __future__ import annotations

import re

from app.agent.plan.execute import execute_plan_instruction
from app.agent.plan.prompts import PLAN_SYSTEM_PROMPT
from app.agent.studio.prompts import ASK_AGENT_SYSTEM, MAIN_AGENT_SYSTEM
from app.docs import DOCS_PREFIX_NOTE, DocsSession
from app.docs import has_docs_prefix, normalize_rel_path

_BACKTICKED = re.compile(r"`([^`\n]+)`")


def _path_examples(text: str) -> list[str]:
    """Concrete .md paths a model could copy verbatim into a tool call."""
    out = []
    for token in _BACKTICKED.findall(text):
        candidate = token.strip()
        if not candidate.lower().endswith(".md"):
            continue
        if "*" in candidate or "..." in candidate:
            continue
        if candidate.startswith(".studio/"):
            continue
        out.append(candidate)
    return out


def test_every_prompt_path_example_normalizes_to_itself() -> None:
    sources = {
        "MAIN_AGENT_SYSTEM": MAIN_AGENT_SYSTEM,
        "ASK_AGENT_SYSTEM": ASK_AGENT_SYSTEM,
        "PLAN_SYSTEM_PROMPT": PLAN_SYSTEM_PROMPT,
        "execute_plan_instruction": execute_plan_instruction(
            ".studio/plans/conv_x-1.md", "# 目标\n- 写愿景"
        ),
    }
    for name, text in sources.items():
        examples = _path_examples(text)
        for example in examples:
            assert normalize_rel_path(example) == example, (
                f"{name} 里的路径示例 {example!r} 不是合法的工具参数："
                f"会被归一化成 {normalize_rel_path(example)!r}"
            )


def test_main_prompt_actually_shows_a_path_example() -> None:
    """Guard the guard: the test above passes vacuously if examples disappear."""
    assert _path_examples(MAIN_AGENT_SYSTEM)


def test_docs_prefix_is_stripped_instead_of_nesting() -> None:
    assert normalize_rel_path("docs/愿景.md") == "愿景.md"
    assert normalize_rel_path("docs/系统/经济.md") == "系统/经济.md"
    assert normalize_rel_path("docs") == ""
    assert normalize_rel_path("系统/经济.md") == "系统/经济.md"


def test_docs_prefix_detection() -> None:
    assert has_docs_prefix("docs/愿景.md")
    assert has_docs_prefix("/docs/愿景.md")
    assert not has_docs_prefix("愿景.md")
    assert not has_docs_prefix("documents/愿景.md")


def test_write_tells_the_model_the_canonical_path_form(data_dir) -> None:
    session = DocsSession("proj_path", writable=True)
    result = session.write([{"path": "docs/愿景.md", "content": "# 愿景"}])
    assert result["ok"] is True
    assert result["results"][0]["path"] == "愿景.md"
    assert result["note"] == DOCS_PREFIX_NOTE
    assert "愿景.md" in session.files
    assert "docs/愿景.md" not in session.files


def test_write_without_prefix_carries_no_note(data_dir) -> None:
    session = DocsSession("proj_path", writable=True)
    result = session.write([{"path": "愿景.md", "content": "# 愿景"}])
    assert result["ok"] is True
    assert "note" not in result
