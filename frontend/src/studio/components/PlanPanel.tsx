import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckCircle2, Circle, CircleDot, FileText } from "lucide-react";
import { Button } from "../../components/ui/button";
import { cn } from "@/lib/utils";
import { planProgressFromMarkdown } from "../lib/planProgress";
import type { PlanProgress, PlanStatus } from "../../types";

/**
 * The plan's task list is its open design questions, so this counts how much of
 * the design is settled — not how much of the plan has been built.
 */
function DesignPointsCard({ progress, running }: { progress: PlanProgress; running: boolean }) {
  const steps = progress.steps;
  if (steps.length < 2) return null;
  const done = steps.filter((s) => s.status === "done").length;
  const pct = Math.round((done / steps.length) * 100);
  const hasDone = done > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-muted/20">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3.5 py-2.5">
        <span className="text-[13px] font-semibold tracking-tight text-foreground">
          待敲定的设计点
        </span>
        <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
          已定 {done}/{steps.length}
        </span>
      </div>
      {hasDone && (
        <div className="h-1 w-full bg-muted/60">
          <div
            className="h-full rounded-r-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <ol className="space-y-0.5 px-2.5 py-2">
        {steps.map((step) => (
          <li
            key={step.id}
            className={cn(
              "flex items-start gap-2 rounded-md px-1.5 py-1 text-[13px] leading-snug",
              step.status === "active" && "bg-primary/8",
            )}
          >
            {step.status === "done" ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
            ) : step.status === "active" ? (
              <CircleDot
                className={cn(
                  "mt-0.5 size-3.5 shrink-0 text-primary",
                  running && "animate-pulse",
                )}
              />
            ) : (
              <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />
            )}
            <span
              className={cn(
                "min-w-0 flex-1",
                step.status === "done" && "text-muted-foreground line-through decoration-muted-foreground/40",
                step.status === "active" && "font-medium text-foreground",
                step.status === "pending" && "text-muted-foreground",
              )}
            >
              {step.title}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

interface Props {
  planMarkdown: string;
  planTitle?: string;
  planStatus?: PlanStatus;
  running: boolean;
  composerRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
  onExecutePlan: () => void;
  executePlanStarting: boolean;
}

export function PlanPanel({
  planMarkdown,
  planTitle,
  planStatus,
  running,
  composerRef,
  onExecutePlan,
  executePlanStarting,
}: Props) {
  const hasPlan = !!planMarkdown.trim();
  const executed = planStatus === "executed";
  const progress = planProgressFromMarkdown(planMarkdown);

  const focusComposer = () => {
    composerRef?.current?.focus();
    composerRef?.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {hasPlan && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-4 py-2.5">
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight">
            {planTitle?.trim() || "未命名计划"}
          </span>
          {executed && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              已执行
            </span>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 panel-fade-in">
        {!hasPlan ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-6 text-center panel-fade-in">
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10">
              <FileText className="size-5 text-primary" />
            </div>
            <h3 className="text-[15px] font-semibold tracking-tight">plan 待生成</h3>
            <p className="mt-1.5 max-w-[280px] text-[14px] leading-relaxed text-muted-foreground">
              用左侧描述创意，或直接让 Agent 在改动较大时 Suggest Plan。确认后可点击「执行计划」。
            </p>
            <div className="mt-6 w-full max-w-xs space-y-2 opacity-40">
              <div className="h-3 w-[75%] rounded-md bg-muted" />
              <div className="h-3 w-full rounded-md bg-muted/70" />
              <div className="h-3 w-[83%] rounded-md bg-muted/50" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="h-14 rounded-lg bg-muted/60" />
                <div className="h-14 rounded-lg bg-muted/40" />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!executed && <DesignPointsCard progress={progress} running={running} />}
            <div className="ws-prose">
              <Markdown remarkPlugins={[remarkGfm]}>{planMarkdown}</Markdown>
            </div>
          </div>
        )}
      </div>

      {hasPlan && !running && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/50 bg-muted/30 px-3 py-2.5">
          {executed ? (
            <span className="truncate text-[12px] text-muted-foreground">
              这份计划已执行完毕，再次进入 Plan 会新建一份。
            </span>
          ) : (
            <span />
          )}
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={focusComposer}>
              继续讨论
            </Button>
            {!executed && (
              <Button size="sm" disabled={executePlanStarting} onClick={onExecutePlan}>
                {executePlanStarting ? "启动中…" : "执行计划"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
