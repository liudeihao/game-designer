import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { PermissionCall, PermissionPart, PermissionStatus } from "../../types";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { toolTitle } from "../lib/toolPresentation";
import { InterruptCard } from "./InterruptCard";

export type PermissionAction = "accept" | "reject" | "comment";

export interface PermissionHandlers {
  onSubmitPermission: (
    answers: Record<string, { action: PermissionAction; comment?: string }>,
    pending: PermissionPart["pending"],
  ) => void;
}

interface Props {
  part: PermissionPart;
  handlers?: PermissionHandlers;
}

function callLabel(call: PermissionCall): string {
  return toolTitle(call.name, call.args, "running");
}

function statusLabel(status: PermissionStatus, comment?: string): string {
  if (status === "accepted") return "已允许执行";
  if (status === "rejected") return "已拒绝，未执行";
  if (status === "commented") return comment ? `补充意见：${comment}` : "已附意见，未按原请求执行";
  return "这次写入需要你确认";
}

export function PermissionPanel({ part, handlers }: Props) {
  const interactive = part.status === "pending" && !!handlers;
  const frozen = part.status !== "pending";
  const calls = part.pending.calls || [];
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [local, setLocal] = useState<Record<string, { action: PermissionAction; comment?: string }>>(
    {},
  );

  const decidedCount = Object.keys(local).length;
  const allDecided = calls.length > 0 && decidedCount >= calls.length;

  const submit = (answers: Record<string, { action: PermissionAction; comment?: string }>) => {
    handlers?.onSubmitPermission(answers, part.pending);
  };

  const decideOne = (callId: string, action: PermissionAction, note = "") => {
    if (calls.length === 1) {
      submit({ [callId]: { action, comment: note } });
      return;
    }
    const next = { ...local, [callId]: { action, comment: note } };
    setLocal(next);
    setCommentingId(null);
    setComment("");
    if (Object.keys(next).length >= calls.length) submit(next);
  };

  const acceptAll = () => {
    const answers: Record<string, { action: PermissionAction; comment?: string }> = {};
    for (const call of calls) answers[call.id] = { action: "accept" };
    submit(answers);
  };

  return (
    <InterruptCard
      embedded
      title={
        <span className="inline-flex items-center gap-2">
          <ShieldAlert className="size-3.5 text-primary" />
          Tool Permission
        </span>
      }
      subtitle={frozen ? statusLabel(part.status, part.comment) : "这次工作区写入需要你确认"}
      footer={
        frozen || !interactive ? undefined : (
          <>
            {calls.length > 1 && (
              <Button size="sm" disabled={!interactive} onClick={acceptAll}>
                全部允许
              </Button>
            )}
            {calls.length > 1 && allDecided && (
              <Button size="sm" onClick={() => submit(local)}>
                确认 {decidedCount}/{calls.length}
              </Button>
            )}
          </>
        )
      }
    >
      <div className="space-y-3 px-3 py-2 text-[13px]">
        {calls.map((call) => {
          const picked = local[call.id];
          const isCommenting = commentingId === call.id;
          return (
            <div key={call.id} className="rounded-lg bg-muted/40 px-3 py-2">
              <p className="font-medium">{callLabel(call)}</p>
              {picked ? (
                <p className="mt-1 text-muted-foreground">
                  {picked.action === "accept"
                    ? "将允许执行"
                    : picked.action === "reject"
                      ? "将拒绝"
                      : `将附意见：${picked.comment || ""}`}
                </p>
              ) : null}
              {!frozen && interactive && !picked && (
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => decideOne(call.id, "reject")}
                  >
                    拒绝
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCommentingId(call.id);
                      setComment("");
                    }}
                  >
                    补充意见
                  </Button>
                  <Button size="sm" onClick={() => decideOne(call.id, "accept")}>
                    允许
                  </Button>
                </div>
              )}
              {isCommenting && (
                <div className="mt-2 space-y-2">
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="告诉 Agent 这次为什么不按原请求执行…"
                    rows={3}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCommentingId(null)}>
                      取消
                    </Button>
                    <Button
                      size="sm"
                      disabled={!comment.trim()}
                      onClick={() => decideOne(call.id, "comment", comment.trim())}
                    >
                      提交意见
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </InterruptCard>
  );
}
