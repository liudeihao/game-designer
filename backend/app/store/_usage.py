"""LLM usage rows and aggregates in the SQLite store."""

from __future__ import annotations

import json
import uuid

from ._connection import connect, locked, now


def insert_usage(
    *,
    project_id: str,
    conversation_id: str,
    turn_id: str,
    model: str,
    role: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
    usage_source: str = "provider",
    input_breakdown: dict[str, int] | None = None,
    tags: list[str] | None = None,
    tools_offered: list | None = None,
    tools_invoked: list | None = None,
) -> dict:
    uid = f"usage_{uuid.uuid4().hex[:12]}"
    ts = now()
    tags_json = json.dumps(list(tags or []), ensure_ascii=False)
    offered_json = json.dumps(list(tools_offered or []), ensure_ascii=False)
    invoked_json = json.dumps(list(tools_invoked or []), ensure_ascii=False)
    with locked():
        conn = connect()
        conn.execute(
            """
            INSERT INTO llm_usage (
                id, project_id, conversation_id, turn_id, model, role,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                usage_source, input_breakdown_json, tags_json, tools_offered_json,
                tools_invoked_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                uid,
                project_id,
                conversation_id,
                turn_id,
                model or "unknown",
                role or "",
                int(input_tokens or 0),
                int(output_tokens or 0),
                int(cache_read_tokens or 0),
                int(cache_write_tokens or 0),
                usage_source if usage_source in {"provider", "estimated"} else "estimated",
                json.dumps(input_breakdown or {}, ensure_ascii=False),
                tags_json,
                offered_json,
                invoked_json,
                ts,
            ),
        )
        conn.commit()
    return {
        "id": uid,
        "project_id": project_id,
        "conversation_id": conversation_id,
        "turn_id": turn_id,
        "model": model or "unknown",
        "role": role or "",
        "input_tokens": int(input_tokens or 0),
        "output_tokens": int(output_tokens or 0),
        "cache_read_tokens": int(cache_read_tokens or 0),
        "cache_write_tokens": int(cache_write_tokens or 0),
        "usage_source": usage_source,
        "input_breakdown": input_breakdown or {},
        "tags": list(tags or []),
        "tools_offered": list(tools_offered or []),
        "tools_invoked": list(tools_invoked or []),
        "created_at": ts,
    }


def _parse_json_list(raw: object) -> list:
    try:
        parsed = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, json.JSONDecodeError):
        return []
    return list(parsed) if isinstance(parsed, list) else []


def _row_has(row, key: str) -> bool:
    try:
        return key in row.keys()
    except Exception:
        return False


def _tags_from_row(row) -> dict:
    return {
        "tags": _parse_json_list(row["tags_json"] if _row_has(row, "tags_json") else "[]"),
        "tools_offered": _parse_json_list(
            row["tools_offered_json"] if _row_has(row, "tools_offered_json") else "[]"
        ),
        "tools_invoked": _parse_json_list(
            row["tools_invoked_json"] if _row_has(row, "tools_invoked_json") else "[]"
        ),
    }


def _parse_input_breakdown(raw: object) -> dict[str, int]:
    try:
        parsed = json.loads(raw or "{}") if not isinstance(raw, dict) else raw
    except (TypeError, json.JSONDecodeError):
        parsed = {}
    if not isinstance(parsed, dict):
        parsed = {}
    return {
        "system": int(parsed.get("system", 0) or 0),
        "rules": int(parsed.get("rules", 0) or 0),
        "tools": int(parsed.get("tools", 0) or 0),
        "conversation": int(parsed.get("conversation", 0) or 0),
        "other": int(parsed.get("other", 0) or 0),
    }


def _aggregate_rows(rows: list) -> dict:
    input_tokens = 0
    output_tokens = 0
    cache_read_tokens = 0
    cache_write_tokens = 0
    calls = 0
    provider_calls = 0
    estimated_calls = 0
    input_breakdown = {"system": 0, "rules": 0, "tools": 0, "conversation": 0, "other": 0}
    by_model: dict[str, dict] = {}
    for row in rows:
        inp = int(row["input_tokens"] or 0)
        out = int(row["output_tokens"] or 0)
        cache_read = int(row["cache_read_tokens"] or 0)
        cache_write = int(row["cache_write_tokens"] or 0)
        model = str(row["model"] or "unknown")
        input_tokens += inp
        output_tokens += out
        cache_read_tokens += cache_read
        cache_write_tokens += cache_write
        calls += 1
        source = str(row["usage_source"] or "provider") if "usage_source" in row.keys() else "provider"
        provider_calls += int(source == "provider")
        estimated_calls += int(source == "estimated")
        parsed_breakdown = _parse_input_breakdown(
            row["input_breakdown_json"] if "input_breakdown_json" in row.keys() else "{}"
        )
        for key in input_breakdown:
            input_breakdown[key] += parsed_breakdown[key]
        bucket = by_model.setdefault(
            model,
            {"model": model, "input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0, "cache_write_tokens": 0, "calls": 0},
        )
        bucket["input_tokens"] += inp
        bucket["output_tokens"] += out
        bucket["cache_read_tokens"] += cache_read
        bucket["cache_write_tokens"] += cache_write
        bucket["calls"] += 1
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cache_read_tokens": cache_read_tokens,
        "cache_write_tokens": cache_write_tokens,
        "total_tokens": input_tokens + output_tokens,
        "calls": calls,
        "provider_calls": provider_calls,
        "estimated_calls": estimated_calls,
        "input_breakdown": input_breakdown,
        "by_model": [
            {
                **b,
                "total_tokens": b["input_tokens"] + b["output_tokens"],
            }
            for b in sorted(by_model.values(), key=lambda x: -(x["input_tokens"] + x["output_tokens"]))
        ],
    }


def summarize_usage(
    *,
    project_id: str | None = None,
    conversation_id: str | None = None,
    turn_id: str | None = None,
) -> dict:
    clauses: list[str] = []
    params: list[str] = []
    if project_id:
        clauses.append("project_id = ?")
        params.append(project_id)
    if conversation_id:
        clauses.append("conversation_id = ?")
        params.append(conversation_id)
    if turn_id:
        clauses.append("turn_id = ?")
        params.append(turn_id)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    with locked():
        conn = connect()
        rows = conn.execute(
            f"SELECT model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, usage_source, input_breakdown_json FROM llm_usage {where}",
            params,
        ).fetchall()
    return _aggregate_rows(rows)


def usage_scopes(
    *,
    project_id: str | None = None,
    conversation_id: str | None = None,
    turn_id: str | None = None,
) -> dict:
    """Return turn / conversation / project aggregates for the workspace meter."""
    turn = summarize_usage(turn_id=turn_id) if turn_id else _aggregate_rows([])
    conversation = (
        summarize_usage(conversation_id=conversation_id) if conversation_id else _aggregate_rows([])
    )
    project = summarize_usage(project_id=project_id) if project_id else _aggregate_rows([])
    return {"turn": turn, "conversation": conversation, "project": project}


def latest_llm_usage(conversation_id: str) -> dict | None:
    """Most recent LLM call for a conversation (for context-window meter)."""
    if not conversation_id:
        return None
    with locked():
        conn = connect()
        row = conn.execute(
            """
            SELECT id, project_id, conversation_id, turn_id, model, role,
                   input_tokens, output_tokens, cache_read_tokens,
                   cache_write_tokens, usage_source, input_breakdown_json,
                   tags_json, tools_offered_json, tools_invoked_json,
                   created_at
            FROM llm_usage
            WHERE conversation_id = ?
            ORDER BY created_at DESC, rowid DESC
            LIMIT 1
            """,
            (conversation_id,),
        ).fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "conversation_id": row["conversation_id"],
        "turn_id": row["turn_id"],
        "model": row["model"] or "unknown",
        "role": row["role"] or "",
        "input_tokens": int(row["input_tokens"] or 0),
        "output_tokens": int(row["output_tokens"] or 0),
        "cache_read_tokens": int(row["cache_read_tokens"] or 0),
        "cache_write_tokens": int(row["cache_write_tokens"] or 0),
        "usage_source": (
            row["usage_source"]
            if row["usage_source"] in {"provider", "estimated"}
            else "estimated"
        ),
        "input_breakdown": _parse_input_breakdown(row["input_breakdown_json"]),
        "created_at": row["created_at"],
        **_tags_from_row(row),
    }


def usage_analytics(
    *,
    since: str | None = None,
    until: str | None = None,
    project_id: str | None = None,
) -> dict:
    clauses: list[str] = []
    params: list[str] = []
    if since:
        clauses.append("created_at >= ?")
        params.append(since)
    if until:
        clauses.append("created_at <= ?")
        params.append(until)
    if project_id:
        clauses.append("project_id = ?")
        params.append(project_id)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    u_clauses: list[str] = []
    if since:
        u_clauses.append("u.created_at >= ?")
    if until:
        u_clauses.append("u.created_at <= ?")
    if project_id:
        u_clauses.append("u.project_id = ?")
    u_where = ("WHERE " + " AND ".join(u_clauses)) if u_clauses else ""

    with locked():
        conn = connect()
        rows = conn.execute(
            f"""
            SELECT id, project_id, conversation_id, turn_id, model, role,
                   input_tokens, output_tokens, cache_read_tokens,
                   cache_write_tokens, usage_source, input_breakdown_json,
                   tags_json, tools_offered_json, tools_invoked_json,
                   created_at
            FROM llm_usage {where}
            ORDER BY created_at DESC
            """,
            params,
        ).fetchall()

        by_day_rows = conn.execute(
            f"""
            SELECT substr(created_at, 1, 10) AS day,
                   SUM(input_tokens) AS input_tokens,
                   SUM(output_tokens) AS output_tokens,
                   SUM(cache_read_tokens) AS cache_read_tokens,
                   SUM(cache_write_tokens) AS cache_write_tokens,
                   COUNT(*) AS calls
            FROM llm_usage {where}
            GROUP BY day
            ORDER BY day ASC
            """,
            params,
        ).fetchall()

        by_project_rows = conn.execute(
            f"""
            SELECT u.project_id AS project_id,
                   COALESCE(p.name, u.project_id) AS project_name,
                   SUM(u.input_tokens) AS input_tokens,
                   SUM(u.output_tokens) AS output_tokens,
                   SUM(u.cache_read_tokens) AS cache_read_tokens,
                   SUM(u.cache_write_tokens) AS cache_write_tokens,
                   COUNT(*) AS calls
            FROM llm_usage u
            LEFT JOIN projects p ON p.id = u.project_id
            {u_where}
            GROUP BY u.project_id
            ORDER BY (SUM(u.input_tokens) + SUM(u.output_tokens)) DESC
            """,
            params,
        ).fetchall()

    totals = _aggregate_rows(rows)
    return {
        "totals": totals,
        "by_day": [
            {
                "day": r["day"],
                "input_tokens": int(r["input_tokens"] or 0),
                "output_tokens": int(r["output_tokens"] or 0),
                "cache_read_tokens": int(r["cache_read_tokens"] or 0),
                "cache_write_tokens": int(r["cache_write_tokens"] or 0),
                "total_tokens": int(r["input_tokens"] or 0) + int(r["output_tokens"] or 0),
                "calls": int(r["calls"] or 0),
            }
            for r in by_day_rows
        ],
        "by_model": totals["by_model"],
        "by_project": [
            {
                "project_id": r["project_id"],
                "project_name": r["project_name"],
                "input_tokens": int(r["input_tokens"] or 0),
                "output_tokens": int(r["output_tokens"] or 0),
                "cache_read_tokens": int(r["cache_read_tokens"] or 0),
                "cache_write_tokens": int(r["cache_write_tokens"] or 0),
                "total_tokens": int(r["input_tokens"] or 0) + int(r["output_tokens"] or 0),
                "calls": int(r["calls"] or 0),
            }
            for r in by_project_rows
        ],
        "recent": [
            {
                "id": r["id"],
                "project_id": r["project_id"],
                "conversation_id": r["conversation_id"],
                "turn_id": r["turn_id"],
                "model": r["model"],
                "role": r["role"],
                "usage_source": (
                    r["usage_source"]
                    if r["usage_source"] in {"provider", "estimated"}
                    else "estimated"
                ),
                "input_breakdown": _parse_input_breakdown(r["input_breakdown_json"]),
                "input_tokens": int(r["input_tokens"] or 0),
                "output_tokens": int(r["output_tokens"] or 0),
                "cache_read_tokens": int(r["cache_read_tokens"] or 0),
                "cache_write_tokens": int(r["cache_write_tokens"] or 0),
                "total_tokens": int(r["input_tokens"] or 0) + int(r["output_tokens"] or 0),
                "created_at": r["created_at"],
                **_tags_from_row(r),
            }
            for r in rows[:50]
        ],
    }
