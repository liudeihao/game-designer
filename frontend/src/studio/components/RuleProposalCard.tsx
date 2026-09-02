import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import type { RuleOperation, RuleProposalPart, RuleScope } from "../../types";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { InterruptCard } from "./InterruptCard";

export interface RuleProposalDraft {
  scope: RuleScope;
  operation: RuleOperation;
  name: string;
  details: string;
}

export interface RuleProposalHandlers {
  onResolve: (part: RuleProposalPart, action: "accept" | "ignore", draft: RuleProposalDraft) => void;
}

const SCOPE_LABEL: Record<RuleScope, string> = {
  user: "User Rule（跨项目）",
  project: "Project Rule（本项目）",
};

const OP_LABEL: Record<RuleOperation, string> = {
  add: "新增",
  update: "更新",
  delete: "删除",
};

function coerceProposal(part: RuleProposalPart): {
  scope: RuleScope;
  operation: RuleOperation;
  name: string;
  details: string;
} {
  const op = String((part as RuleProposalPart & { text?: string }).operation || "");
  const raw = part as RuleProposalPart & { text?: string };
  const operation: RuleOperation =
    op === "update" || op === "delete"
      ? op
      : op === "replace"
        ? "update"
        : op === "clear"
          ? "delete"
          : "add";
  return {
    scope: raw.scope === "user" ? "user" : "project",
    operation,
    name: raw.name || "",
    details: raw.details || raw.text || "",
  };
}

function acceptLabel(scope: RuleScope, operation: RuleOperation): string {
  if (operation === "delete") return scope === "user" ? "删除 User Rule" : "删除 Project Rule";
  if (operation === "update") return scope === "user" ? "更新 User Rule" : "更新 Project Rule";
  return scope === "user" ? "添加为 User Rule" : "添加为 Project Rule";
}

export function RuleProposalCard({
  part,
  handlers,
}: {
  part: RuleProposalPart;
  handlers?: RuleProposalHandlers;
}) {
  const frozen = part.status !== "pending";
  const initial = coerceProposal(part);
  const [scope, setScope] = useState<RuleScope>(initial.scope);
  const [operation, setOperation] = useState<RuleOperation>(initial.operation);
  const [name, setName] = useState(initial.name);
  const [details, setDetails] = useState(initial.details);

  useEffect(() => {
    const next = coerceProposal(part);
    setScope(next.scope);
    setOperation(next.operation);
    setName(next.name);
    setDetails(next.details);
  }, [part.id, part.scope, part.operation, part.name, part.details]);

  const subtitle =
    part.status === "accepted"
      ? "已写入 Rule"
      : part.status === "ignored"
        ? "已忽略"
        : "Agent 建议写成 Rule，确认后才落盘";

  const canAccept =
    !!name.trim() && (operation === "delete" || !!details.trim());

  const draft: RuleProposalDraft = { scope, operation, name, details };
  const view = coerceProposal(part);

  return (
    <InterruptCard
      embedded
      title={
        <span className="inline-flex items-center gap-2">
          <ScrollText className="size-3.5 text-primary" />
          Rule Proposal
        </span>
      }
      subtitle={subtitle}
      footer={
        frozen ? undefined : (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!handlers}
              onClick={() => handlers?.onResolve(part, "ignore", draft)}
            >
              忽略
            </Button>
            <Button
              size="sm"
              disabled={!handlers || !canAccept}
              onClick={() => handlers?.onResolve(part, "accept", draft)}
            >
              {acceptLabel(scope, operation)}
            </Button>
          </>
        )
      }
    >
      {frozen ? (
        <p className="px-3 py-2 text-[13px] text-muted-foreground/80">
          {OP_LABEL[view.operation]} · {SCOPE_LABEL[view.scope]} · {view.name.trim() || "未命名"}
          {view.details ? ` — ${view.details}` : ""}
        </p>
      ) : (
        <div className="space-y-2 px-3 py-2">
          <label className="block text-[12px] text-muted-foreground">
            层级
            <select
              className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-[13px]"
              value={scope}
              onChange={(e) => setScope(e.target.value as RuleScope)}
            >
              <option value="project">{SCOPE_LABEL.project}</option>
              <option value="user">{SCOPE_LABEL.user}</option>
            </select>
          </label>
          <label className="block text-[12px] text-muted-foreground">
            操作
            <select
              className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-[13px]"
              value={operation}
              onChange={(e) => setOperation(e.target.value as RuleOperation)}
            >
              <option value="add">{OP_LABEL.add}</option>
              <option value="update">{OP_LABEL.update}</option>
              <option value="delete">{OP_LABEL.delete}</option>
            </select>
          </label>
          <label className="block text-[12px] text-muted-foreground">
            名称
            <Input
              className="mt-1 h-8 text-[13px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：先问再写"
            />
          </label>
          {operation !== "delete" ? (
            <label className="block text-[12px] text-muted-foreground">
              详情
              <Textarea
                className="mt-1 min-h-[72px] text-[13px]"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="将写入这条 Rule 的详情"
              />
            </label>
          ) : null}
        </div>
      )}
    </InterruptCard>
  );
}
