import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { ContextUsage } from "../types";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { pickContextUsage } from "./contextUsageDisplay";

function formatTokensShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${k >= 100 ? Math.round(k) : k.toFixed(k >= 10 ? 0 : 1)}K`;
  }
  return String(Math.max(0, Math.round(n)));
}

function Ring({ percent, size = 18, stroke = 2 }: { percent: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, percent));
  const offset = c * (1 - pct / 100);
  const tone =
    pct >= 90 ? "stroke-destructive" : pct >= 75 ? "stroke-amber-500" : "stroke-primary";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        className="stroke-muted-foreground/25"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        className={tone}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

interface Props {
  conversationId: string | null;
  model?: string;
  providerId?: string;
  /** Reading streamed on SSE usage events; takes over while a turn runs. */
  live?: ContextUsage | null;
  refreshKey?: string | number;
  className?: string;
  panelClassName?: string;
}

export function ContextUsageControl({
  conversationId,
  model,
  providerId,
  live,
  refreshKey,
  className,
  panelClassName,
}: Props) {
  const [fetched, setFetched] = useState<ContextUsage | null>(null);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  // Snapshot fetch covers opening a conversation and the pre-first-call
  // estimate. Skip only when this conversation already has an SSE reading —
  // not merely because *some* turn is running, which used to keep the previous
  // conversation's numbers on screen after a switch.
  useEffect(() => {
    if (!conversationId) {
      setFetched(null);
      setFetchedFor(null);
      return;
    }
    if (live) return;
    let cancelled = false;
    const ac = new AbortController();
    const request = ++requestRef.current;
    api
      .getContextUsage(conversationId, model, ac.signal, providerId)
      .then((data) => {
        if (!cancelled && request === requestRef.current) {
          setFetchedFor(conversationId);
          setFetched(data);
        }
      })
      .catch((err) => {
        if (ac.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        if (!cancelled && request === requestRef.current) {
          setFetchedFor(conversationId);
          setFetched(null);
        }
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [conversationId, model, providerId, refreshKey, live]);

  const usage = pickContextUsage(conversationId, live, fetched, fetchedFor);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const totalLabel = useMemo(() => {
    if (!usage) return "—";
    return `${formatTokensShort(usage.total_tokens)}/${formatTokensShort(usage.context_limit)} tokens`;
  }, [usage]);

  if (!conversationId) return null;

  const percent = usage?.percent ?? 0;
  const categories = usage?.categories ?? [];
  const used = Math.max(1, usage?.total_tokens ?? 1);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {open && usage && (
        <div
          className={cn(
            "absolute bottom-[calc(100%+12px)] z-40 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border/60 bg-popover p-3 text-popover-foreground shadow-lg",
            panelClassName || "left-0",
          )}
          role="dialog"
          aria-label="Context Usage"
        >
          <div className="mb-2.5 text-[13px] font-semibold tracking-tight">Context Usage</div>
          <div className="mb-3 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            {categories.map((c) => {
              const width = Math.max(c.tokens > 0 ? 2 : 0, (c.tokens / used) * 100);
              if (c.tokens <= 0) return null;
              return (
                <div
                  key={c.id}
                  title={`${c.label}: ${formatTokensShort(c.tokens)}`}
                  style={{ width: `${width}%`, backgroundColor: c.color }}
                  className="h-full min-w-0"
                />
              );
            })}
          </div>
          <div className="space-y-1.5">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                    aria-hidden
                  />
                  <span className="truncate">{c.label}</span>
                </span>
                <span className="shrink-0 font-mono tabular-nums text-foreground">
                  {formatTokensShort(c.tokens)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
            <div>
              {percent.toFixed(percent >= 10 ? 0 : 1)}% · {totalLabel}
            </div>
            <div className="mt-1">
              {usage.source === "provider"
                ? "上次调用 · 供应商实报 input"
                : usage.source === "estimated"
                  ? "上次调用 · 本地估算 input"
                  : "尚未调用 · 下一跳投影"}
            </div>
          </div>
        </div>
      )}

      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground",
                "hover:bg-muted/60 hover:text-foreground",
                open && "bg-muted/60 text-foreground",
              )}
              aria-label="Context usage"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <Ring percent={percent} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="px-2.5 py-1.5">
            <div className="text-[12px] font-medium tabular-nums">
              {percent.toFixed(percent >= 10 ? 0 : 1)}% context used
            </div>
            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
              {totalLabel}
            </div>
            {usage?.source && usage.source !== "projected" && (
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {usage.source === "provider" ? "上次调用实报" : "上次调用估算"}
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
