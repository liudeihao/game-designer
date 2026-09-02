"""Tool Permission for this Workspace Mutation Tool Call.

HITL is decided by :func:`hitl_enabled`. Reject / Comment skip execution and
still close the Call with a distinguishable Tool Result.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Optional

from app.agent.tools.models import ToolExecution

# Default for resolve_permissions when the caller does not pass auto_accept.
# The graph uses :func:`hitl_enabled` instead of this constant.
AUTO_ACCEPT = True

# Temporarily off: Agent writes auto-accept. Set True to restore Tool Permission.
HITL_INTERRUPTS = False


def hitl_enabled(*, mode: str = "", trigger: str = "") -> bool:
    """True when this turn should interrupt on Workspace Mutations.

    Agent-at-rest waits when :data:`HITL_INTERRUPTS` is True. Plan / Ask cannot
    mutate the workspace. Execute Plan is a batch write the user already
    authorized, so it does not wait.
    """
    if not HITL_INTERRUPTS:
        return False
    if (mode or "").strip() in {"plan", "ask"}:
        return False
    if (trigger or "").strip() == "execute_plan":
        return False
    return True


def decision_to_dict(decision: PermissionDecision) -> dict[str, Any]:
    return {
        "call_id": decision.call_id,
        "mutation": decision.mutation,
        "status": decision.status,
        "execute": decision.execute,
        "comment": decision.comment,
    }


def decision_from_dict(raw: dict[str, Any]) -> PermissionDecision:
    status = raw.get("status")
    return PermissionDecision(
        call_id=str(raw.get("call_id") or ""),
        mutation=bool(raw.get("mutation")),
        status=status if status in {"accepted", "rejected", "commented", "pending"} else None,
        execute=bool(raw.get("execute")),
        comment=str(raw.get("comment") or ""),
    )

PermissionStatus = Literal["accepted", "rejected", "commented", "pending"]

_WRITE_OPS = frozenset(
    {"workspace_write", "workspace_search_replace", "workspace_delete"}
)


def _field(call: Any, key: str, default: Any = None) -> Any:
    if isinstance(call, dict):
        return call.get(key, default)
    return getattr(call, key, default)


def call_id_of(call: Any) -> str:
    return str(_field(call, "id", "") or "")


def call_name_of(call: Any) -> str:
    return str(_field(call, "name", "") or "")


def call_args_of(call: Any) -> dict[str, Any]:
    raw = _field(call, "args", None) or _field(call, "arguments", None) or {}
    return raw if isinstance(raw, dict) else {"input": raw}


def is_workspace_mutation(call: Any) -> bool:
    """True when this Tool Call would persist a workspace change.

    Builtin writes are the three workspace mutation tools.
    """
    name = call_name_of(call)
    args = call_args_of(call)
    if name == "workspace_delete":
        paths = args.get("paths") or args.get("path")
        return bool(paths)
    if name == "workspace_search_replace":
        return bool(str(args.get("path") or "").strip())
    if name == "workspace_write":
        files = args.get("files")
        if isinstance(files, list) and files:
            return True
        return bool(str(args.get("path") or "").strip())
    if name in _WRITE_OPS:
        return True
    return False


@dataclass(frozen=True)
class PermissionDecision:
    call_id: str
    mutation: bool
    status: Optional[PermissionStatus]
    execute: bool
    comment: str = ""

    def skipped_execution(self, call: Any) -> ToolExecution:
        name = call_name_of(call)
        args = call_args_of(call)
        if self.status == "commented":
            text = f"用户 Comment，这次不按原请求执行：{self.comment}".strip()
            outcome = "comment"
        else:
            text = "用户 Reject 了这次 Tool Call，未执行。"
            outcome = "reject"
        return {
            "name": name,
            "args": args,
            "result": text,
            "ok": False,
            "call_id": self.call_id or call_id_of(call),
            "permission_outcome": outcome,
        }


def normalize_permission_answers(
    raw: Any, mutations: list[Any]
) -> dict[str, dict[str, Any]]:
    """Map an interrupt resume payload onto per-call accept/reject/comment.

    Missing or invalid answers default to reject so a mutation cannot slip
    through an empty resume.
    """
    if not isinstance(raw, dict):
        raw = {}
    out: dict[str, dict[str, Any]] = {}
    nested = raw.get("answers") if isinstance(raw.get("answers"), dict) else None
    source = nested if nested else raw
    for call in mutations:
        cid = call_id_of(call)
        item = source.get(cid) if isinstance(source, dict) else None
        if not isinstance(item, dict):
            out[cid] = {"action": "reject"}
            continue
        action = str(item.get("action") or "").strip().lower()
        if action not in {"accept", "reject", "comment"}:
            action = "reject"
        out[cid] = {"action": action, "comment": str(item.get("comment") or "")}
    return out


def decide_permissions(
    calls: list[Any],
    *,
    mode: str = "",
    trigger: str = "",
    answers: Any = None,
) -> list[PermissionDecision]:
    """HITL-aware decisions for a bound tool batch.

    ``answers`` is the raw interrupt resume (or None when no interrupt ran).
    Auto-accept only when :func:`hitl_enabled` is false for this turn.
    """
    need_hitl = hitl_enabled(mode=mode, trigger=trigger)
    mutations = [c for c in calls if is_workspace_mutation(c)]
    normalized = None
    if answers is not None:
        normalized = normalize_permission_answers(answers, mutations)
    return resolve_permissions(
        calls,
        answers=normalized,
        auto_accept=not need_hitl,
    )


def resolve_permissions(
    calls: list[Any],
    *,
    answers: dict[str, dict[str, Any]] | None = None,
    auto_accept: bool = AUTO_ACCEPT,
) -> list[PermissionDecision]:
    """One decision per Tool Call. Non-mutations pass through with no Permission."""
    out: list[PermissionDecision] = []
    for call in calls:
        cid = call_id_of(call)
        if not is_workspace_mutation(call):
            out.append(
                PermissionDecision(call_id=cid, mutation=False, status=None, execute=True)
            )
            continue
        answer = (answers or {}).get(cid) or (answers or {}).get(call_name_of(call)) or {}
        action = str(answer.get("action") or "").strip().lower()
        comment = str(answer.get("comment") or "").strip()
        if action == "reject":
            out.append(
                PermissionDecision(
                    call_id=cid, mutation=True, status="rejected", execute=False
                )
            )
        elif action == "comment":
            out.append(
                PermissionDecision(
                    call_id=cid,
                    mutation=True,
                    status="commented",
                    execute=False,
                    comment=comment,
                )
            )
        elif action == "accept" or auto_accept:
            out.append(
                PermissionDecision(
                    call_id=cid, mutation=True, status="accepted", execute=True
                )
            )
        else:
            out.append(
                PermissionDecision(
                    call_id=cid, mutation=True, status="pending", execute=False
                )
            )
    return out


def result_outcome(result: dict[str, Any]) -> str:
    perm = result.get("permission_outcome")
    if perm in {"reject", "comment"}:
        return str(perm)
    return "success" if result.get("ok") else "error"
