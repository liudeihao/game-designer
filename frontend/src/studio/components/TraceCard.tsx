import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Wrench,
  X,
} from "lucide-react";
import type { TracePart, TraceStep } from "../../types";
import {
  formatToolJson,
  hasFriendlyBody,
  parseToolJson,
  toolFriendlyDetails,
} from "../lib/toolPresentation";
import {
  capabilityLabel,
  formatHandoffPrompt,
  formatHandoffReply,
  isHandoffTrace,
  summarizeTraceWork,
  traceLabel,
} from "../streamUtils";
import { isCapabilityShell } from "../traceVisibility";
import { cn } from "@/lib/utils";
import { FileRefsBar } from "./FileRefsBar";

interface Props {
  trace: TracePart;
  depth?: number;
  /** Only expand when the parent explicitly forces it (user click otherwise). */
  forceOpen?: boolean;
  onOpenFile?: (path: string) => void;
}

type ToolView = "summary" | "detail";

function isToolCard(trace: TracePart): boolean {
  if (trace.kind === "handoff" || trace.kind === "capability") return false;
  if (trace.kind === "tool" || trace.agent === "Tool") return true;
  return (
    trace.name.startsWith("workspace_") ||
    trace.name === "write_plan" ||
    trace.name === "update_plan" ||
    trace.name === "conversation_get_summary"
  );
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "route":
      return "路由";
    case "work":
      return "工作";
    case "gate":
      return "质检";
    case "approval":
      return "审批";
    case "error":
      return "错误";
    case "warning":
      return "警告";
    default:
      return kind || "步骤";
  }
}

function StepsList({ steps }: { steps: TraceStep[] }) {
  if (!steps.length) return null;
  return (
    <div>
      <div className="mb-1 text-[12px] font-medium text-muted-foreground">过程</div>
      <ul className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={`${s.ts || ""}-${i}`} className="rounded bg-background/50 px-2 py-1.5">
            <div className="mb-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span className="font-medium text-foreground/80">{s.agent}</span>
              <span className="rounded bg-muted px-1 py-px text-[10px]">{kindLabel(s.kind)}</span>
            </div>
            <div className="whitespace-pre-wrap text-[13px] leading-snug text-foreground/90">
              {s.message}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusIcon({ status }: { status: TracePart["status"] }) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center",
        status === "success" && "text-success",
        status === "warning" && "text-warning",
        status === "error" && "text-destructive",
        status === "running" && "text-muted-foreground",
      )}
    >
      {status === "running" && <Loader2 className="size-3 animate-spin" />}
      {status === "success" && <Check className="size-3" />}
      {status === "warning" && <AlertTriangle className="size-3" />}
      {status === "error" && <X className="size-3" />}
    </span>
  );
}

function WorkChips({
  explored,
  edited,
  thoughtSeconds,
  running,
}: {
  explored: number;
  edited: number;
  thoughtSeconds: number | null;
  running?: boolean;
}) {
  const bits: string[] = [];
  if (explored > 0) bits.push(`Explored ${explored}`);
  if (edited > 0) bits.push(`Edited ${edited}`);
  if (thoughtSeconds != null) {
    bits.push(running ? `Thinking ${thoughtSeconds}s` : `Thought for ${thoughtSeconds}s`);
  }
  if (!bits.length) return null;
  return (
    <span className="ml-1.5 shrink-0 text-[12px] text-muted-foreground">
      {bits.join(" · ")}
    </span>
  );
}

function Section({
  title,
  children,
  tone = "default",
}: {
  title: string;
  children: ReactNode;
  tone?: "default" | "muted";
}) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-medium text-muted-foreground">{title}</div>
      <div
        className={cn(
          "whitespace-pre-wrap text-[13px] leading-relaxed",
          tone === "muted" ? "text-muted-foreground" : "text-foreground/90",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function HandoffCard({ trace, forceOpen }: { trace: TracePart; forceOpen?: boolean }) {
  const cap =
    typeof trace.args?.capability === "string" ? capabilityLabel(trace.args.capability) : "Agent";
  const prompt = formatHandoffPrompt(trace);
  const reply = formatHandoffReply(trace);
  const [now, setNow] = useState(() => Date.now());
  const running = trace.status === "running" || Boolean(trace.awaitingChildren);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const stats = summarizeTraceWork(trace, now);
  const hasBody = Boolean(
    prompt || reply || stats.activities.length || trace.error || (trace.children || []).length,
  );
  const [open, setOpen] = useState(Boolean(forceOpen));
  const expanded = hasBody && open;
  const promptTitle = prompt
    ? prompt.split("\n")[0].slice(0, 80) + (prompt.split("\n")[0].length > 80 ? "…" : "")
    : "";
  // One identity label, optional task subtitle.
  const title = promptTitle || (running ? "执行中…" : "已完成");

  return (
    <div className="my-1.5 overflow-hidden rounded-md bg-muted/40 text-[14px] ring-1 ring-primary/15">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/60"
        onClick={() => hasBody && setOpen((v) => !v)}
        aria-expanded={expanded}
      >
        <StatusIcon status={running ? "running" : trace.status} />
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          <Bot className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="mr-1.5 font-medium text-foreground/90">{cap}</span>
          <span className="text-muted-foreground">{title}</span>
        </span>
        <WorkChips
          explored={stats.explored}
          edited={stats.edited}
          thoughtSeconds={stats.thoughtSeconds}
          running={running}
        />
        {hasBody &&
          (expanded ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          ))}
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-border/40 bg-muted/20 px-2.5 py-2.5">
          {prompt && <Section title="任务">{prompt}</Section>}
          {stats.activities.length > 0 && (
            <div>
              <div className="mb-1 text-[12px] font-medium text-muted-foreground">过程</div>
              <ul className="space-y-1">
                {stats.activities.map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2 text-[13px] leading-snug text-foreground/85"
                  >
                    <Wrench className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {running && !reply && (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {cap} 正在回复…
            </div>
          )}
          {reply && <Section title="回复">{reply}</Section>}
          {trace.error && (
            <Section title="错误">
              <span className="text-destructive">{trace.error}</span>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function previewSnippet(text: string, limit = 240): string {
  const t = text.trim();
  if (t.length <= limit) return t;
  return `${t.slice(0, limit).trimEnd()}…`;
}

function EditPreview({ old, neu }: { old?: string; neu?: string }) {
  if (!old && !neu) return null;
  return (
    <div className="space-y-1 rounded-md bg-background/50 px-2 py-1.5 font-mono text-[12px] leading-snug">
      {old ? (
        <div className="text-destructive/80">
          <span className="mr-1 text-muted-foreground">−</span>
          {previewSnippet(old)}
        </div>
      ) : null}
      {neu ? (
        <div className="text-success">
          <span className="mr-1 text-muted-foreground">+</span>
          {previewSnippet(neu)}
        </div>
      ) : null}
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: ToolView; onChange: (next: ToolView) => void }) {
  return (
    <div className="flex items-center gap-1 text-[12px]" role="tablist" aria-label="卡片视图">
      {(
        [
          ["summary", "概要"],
          ["detail", "详情"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={view === id}
          className={cn(
            "rounded px-1.5 py-0.5",
            view === id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function TraceCard({ trace, depth = 0, forceOpen, onOpenFile }: Props) {
  if (isHandoffTrace(trace) && depth === 0) {
    return <HandoffCard trace={trace} forceOpen={forceOpen} />;
  }

  // Defensive: never show a second agent card for the specialist shell.
  if (isCapabilityShell(trace) && depth > 0) {
    const kids = trace.children || [];
    if (!kids.length) return null;
    return (
      <>
        {kids.map((child) => (
          <TraceCard
            key={child.id}
            trace={child}
            depth={depth}
            forceOpen={forceOpen}
            onOpenFile={onOpenFile}
          />
        ))}
      </>
    );
  }

  const children = (trace.children || []).filter((c) => !isCapabilityShell(c));
  const steps = trace.steps || [];
  const label = traceLabel(trace.name, trace.args, trace.status, trace.result);
  const isTool = isToolCard(trace);
  const details = isTool ? toolFriendlyDetails(trace.name, trace.args, trace.result) : null;
  const hasArgs = Boolean(trace.args && Object.keys(trace.args).length);
  const hasResult = Boolean(trace.result);
  const hasBody = isTool
    ? Boolean(
        hasArgs ||
          hasResult ||
          (details && hasFriendlyBody(details)) ||
          trace.error ||
          children.length ||
          steps.length,
      )
    : Boolean(hasResult || trace.error || children.length || steps.length);
  const [open, setOpen] = useState(Boolean(forceOpen));
  const [view, setView] = useState<ToolView>("summary");
  const expanded = hasBody && open;
  const previewInFiles = Boolean(
    details?.files.some((f) => f.op === "search_replace" && (f.old || f.new)),
  );

  return (
    <div
      className={cn(
        "my-1.5 overflow-hidden rounded-md text-[14px]",
        depth === 0 ? "bg-muted/40" : "bg-background/60 ring-1 ring-border/40",
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/60"
        onClick={() => hasBody && setOpen((v) => !v)}
        aria-expanded={expanded}
      >
        <StatusIcon status={trace.status} />
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {isTool ? <Wrench className="size-3.5" /> : <Bot className="size-3.5" />}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {!isTool && (
            <span className="mr-1.5 text-muted-foreground">{trace.agent}</span>
          )}
          {label}
        </span>
        {hasBody &&
          (expanded ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          ))}
      </button>
      {expanded && (
        <div className="space-y-2.5 border-t border-border/40 bg-muted/20 px-2.5 py-2">
          {isTool && <ViewToggle view={view} onChange={setView} />}
          {steps.length > 0 && <StepsList steps={steps} />}
          {children.length > 0 && (
            <div className="space-y-1">
              {children.map((child) => (
                <TraceCard
                  key={child.id}
                  trace={child}
                  depth={depth + 1}
                  onOpenFile={onOpenFile}
                />
              ))}
            </div>
          )}
          {isTool && view === "summary" && details && (
            <>
              {details.files.length > 0 && (
                <FileRefsBar files={details.files} onOpenFile={onOpenFile} className="mt-0" />
              )}
              {details.lines.map((line) => (
                <p key={line} className="text-[13px] leading-relaxed text-foreground/90">
                  {line}
                </p>
              ))}
              {!previewInFiles && details.preview && (
                <EditPreview old={details.preview.old} neu={details.preview.new} />
              )}
            </>
          )}
          {isTool && view === "detail" && (
            <>
              {hasArgs && (
                <Section title="参数" tone="muted">
                  <span className="font-mono text-[12px]">{formatToolJson(trace.args)}</span>
                </Section>
              )}
              {hasResult && (
                <Section title="结果" tone="muted">
                  <span className="font-mono text-[12px]">
                    {formatToolJson(parseToolJson(trace.result))}
                  </span>
                </Section>
              )}
            </>
          )}
          {!isTool && hasResult && trace.result && <Section title="结果">{trace.result}</Section>}
          {trace.error && (
            <Section title="错误">
              <span className="text-destructive">{trace.error}</span>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
