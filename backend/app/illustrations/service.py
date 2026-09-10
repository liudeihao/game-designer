"""Compile prompts, generate images, and place immutable records."""

from __future__ import annotations

from typing import Any

from app.docs._store import load_revs, normalize_rel_path, read_file
from app.image.client import ImageNotConfiguredError, generate_image_bytes
from app.illustrations.store import (
    HOMES,
    image_file,
    list_records,
    load_settings,
    new_id,
    public_record as to_public,
    read_record,
    save_record_meta,
    save_settings as persist_settings,
    write_record,
)
from app.llm.client import LLMNotConfiguredError, get_llm

GENERATE_ILLUSTRATION_TOOL = "generate_illustration"
LIST_ILLUSTRATIONS_TOOL = "list_illustrations"

_COMPILE_SYSTEM = (
    "把下面的游戏设计文档收成一段可画的视觉短描述。"
    "不要复述剧情、数值或系统规则。"
    "只写：主体、剪影、时代或材质、色彩、镜头或媒介、禁止项。"
    "用中文，不超过 120 字。不要输出解释或标题。"
)


class IllustrationError(ValueError):
    """User-facing illustration error."""


def get_settings(project_id: str) -> dict[str, Any]:
    return load_settings(project_id)


def save_settings(
    project_id: str,
    *,
    style_text: str | None = None,
    use_style_default: bool | None = None,
) -> dict[str, Any]:
    return persist_settings(
        project_id,
        style_text=style_text,
        use_style_default=use_style_default,
    )


def _resolve_use_style(project_id: str, use_style: bool | None) -> bool:
    if use_style is None:
        return bool(load_settings(project_id).get("use_style_default", True))
    return bool(use_style)


def _normalize_home(home: str, linked_doc: str | None) -> tuple[str, str | None, bool]:
    key = (home or "").strip() or ("doc" if (linked_doc or "").strip() else "unbound")
    if key not in HOMES:
        raise IllustrationError("落入哪里只能是 doc、unbound 或 draft。")
    doc = (linked_doc or "").strip() or None
    if doc:
        try:
            doc = normalize_rel_path(doc)
        except ValueError as exc:
            raise IllustrationError(str(exc)) from exc
    if key == "doc":
        if not doc:
            raise IllustrationError("挂到文档时必须指定一篇已有 Markdown。")
        return "doc", doc, False
    if key == "draft":
        return "draft", None, True
    return "unbound", None, False


async def _visual_blurb(doc_text: str) -> str:
    llm = get_llm()
    # Keep the source short so we never dump a novel into the compiler.
    excerpt = (doc_text or "").strip()
    if len(excerpt) > 4000:
        excerpt = excerpt[:4000]
    try:
        msg = await llm.ainvoke(
            [
                {"role": "system", "content": _COMPILE_SYSTEM},
                {"role": "user", "content": excerpt or "（空文档）"},
            ]
        )
    except Exception as exc:
        raise IllustrationError(f"无法从文档编译视觉描述: {exc}") from exc
    text = getattr(msg, "content", None)
    if isinstance(text, str):
        return text.strip()
    if isinstance(text, list):
        bits = []
        for item in text:
            if isinstance(item, str):
                bits.append(item)
            elif isinstance(item, dict) and item.get("type") == "text":
                bits.append(str(item.get("text") or ""))
        return "".join(bits).strip()
    return str(text or "").strip()


async def compile_prompt(
    project_id: str,
    *,
    extras: str = "",
    use_style: bool | None = None,
    linked_doc: str | None = None,
    final_prompt: str = "",
) -> dict[str, Any]:
    """Build the prompt the user can edit. Never concatenates the full doc."""
    settings = load_settings(project_id)
    want_style = _resolve_use_style(project_id, use_style)
    style_text = (settings.get("style_text") or "").strip() if want_style else ""
    extra = (extras or "").strip()
    given = (final_prompt or "").strip()
    blurb = ""
    doc_path = (linked_doc or "").strip() or None
    if doc_path:
        try:
            doc_path = normalize_rel_path(doc_path)
        except ValueError as exc:
            raise IllustrationError(str(exc)) from exc
        fetched = read_file(project_id, doc_path)
        if not fetched.get("ok"):
            raise IllustrationError(str(fetched.get("error") or f"读不到 {doc_path}"))
        if not given:
            try:
                blurb = await _visual_blurb(str(fetched.get("content") or ""))
            except LLMNotConfiguredError as exc:
                raise IllustrationError(str(exc)) from exc
    parts: list[str] = []
    if given:
        parts.append(given)
    else:
        if style_text:
            parts.append(style_text)
        if extra:
            parts.append(extra)
        if blurb:
            parts.append(blurb)
    prompt = "\n\n".join(p for p in parts if p).strip()
    return {
        "prompt": prompt,
        "extras": extra,
        "style_used": bool(style_text),
        "style_text": style_text,
        "linked_doc": doc_path,
        "blurb": blurb,
        "use_style": want_style,
    }


async def generate_illustration(
    project_id: str,
    *,
    prompt: str = "",
    extras: str = "",
    use_style: bool | None = None,
    home: str = "draft",
    linked_doc: str | None = None,
    conversation_id: str | None = None,
) -> dict[str, Any]:
    compiled = await compile_prompt(
        project_id,
        extras=extras,
        use_style=use_style,
        linked_doc=linked_doc,
        final_prompt=prompt,
    )
    final = (compiled["prompt"] or "").strip()
    if not final:
        raise IllustrationError("提示词为空。请加料、挂一篇文档，或直接写下提示词。")
    dest, doc, draft = _normalize_home(home, linked_doc or compiled.get("linked_doc"))
    linked_rev = None
    if dest == "doc" and doc:
        fetched = read_file(project_id, doc)
        if not fetched.get("ok"):
            raise IllustrationError(str(fetched.get("error") or f"读不到 {doc}"))
        revs = load_revs(project_id)
        raw_rev = revs.get(doc)
        linked_rev = int(raw_rev) if raw_rev is not None else int(fetched.get("rev") or 0)
    try:
        blob, ext = generate_image_bytes(final)
    except ImageNotConfiguredError as exc:
        raise IllustrationError(str(exc)) from exc
    except RuntimeError as exc:
        raise IllustrationError(str(exc)) from exc
    from datetime import datetime, timezone

    record = {
        "id": new_id(),
        "prompt": final,
        "extras": compiled.get("extras") or "",
        "style_used": bool(compiled.get("style_used")),
        "style_text": compiled.get("style_text") or "",
        "linked_doc": doc,
        "linked_rev": linked_rev,
        "draft": draft,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "conversation_id": (conversation_id or "").strip() or None,
    }
    stored = write_record(project_id, record, blob, ext)
    return to_public(stored, project_id)


def list_illustrations(
    project_id: str,
    *,
    linked_doc: str | None = None,
    include_drafts: bool = True,
) -> list[dict[str, Any]]:
    rows = [to_public(item, project_id) for item in list_records(project_id)]
    if linked_doc is not None:
        want = ""
        raw = (linked_doc or "").strip()
        if raw:
            try:
                want = normalize_rel_path(raw)
            except ValueError:
                want = raw
        rows = [row for row in rows if (row.get("linked_doc") or "") == want]
    if not include_drafts:
        rows = [row for row in rows if not row.get("draft")]
    return rows


def get_record(project_id: str, illustration_id: str) -> dict[str, Any] | None:
    raw = read_record(project_id, illustration_id)
    return to_public(raw, project_id) if raw else None


def get_image(project_id: str, illustration_id: str):
    return image_file(project_id, illustration_id)


def place_illustration(
    project_id: str,
    illustration_id: str,
    *,
    home: str,
    linked_doc: str | None = None,
) -> dict[str, Any]:
    raw = read_record(project_id, illustration_id)
    if raw is None:
        raise IllustrationError("找不到这张插画。")
    dest, doc, draft = _normalize_home(home, linked_doc)
    linked_rev = raw.get("linked_rev")
    if dest == "doc" and doc:
        fetched = read_file(project_id, doc)
        if not fetched.get("ok"):
            raise IllustrationError(str(fetched.get("error") or f"读不到 {doc}"))
        revs = load_revs(project_id)
        raw_rev = revs.get(doc)
        linked_rev = int(raw_rev) if raw_rev is not None else int(fetched.get("rev") or 0)
    else:
        linked_rev = None
    # Prompt and image stay frozen; only the home fields change.
    raw["linked_doc"] = doc
    raw["linked_rev"] = linked_rev
    raw["draft"] = draft
    saved = save_record_meta(project_id, raw)
    return to_public(saved, project_id)


def public_record(record: dict[str, Any], project_id: str) -> dict[str, Any]:
    return to_public(record, project_id)
