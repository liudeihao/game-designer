import { Link } from "react-router-dom";
import { Coins } from "lucide-react";
import type { UsageBucket, UsageScopes } from "../types";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/** Prompt-cache hit rate: cache_read / input. */
function cacheHitRate(bucket: UsageBucket): number | null {
  const input = bucket.input_tokens || 0;
  const cached = bucket.cache_read_tokens || 0;
  if (input <= 0) return null;
  return Math.min(100, (cached / input) * 100);
}

function formatCacheRate(bucket: UsageBucket): string | null {
  const rate = cacheHitRate(bucket);
  if (rate == null) return null;
  return `${rate >= 10 ? rate.toFixed(0) : rate.toFixed(1)}%`;
}

function ScopeLine({
  label,
  bucket,
  showCache,
}: {
  label: string;
  bucket: UsageBucket;
  showCache?: boolean;
}) {
  const cacheLabel = showCache ? formatCacheRate(bucket) : null;
  return (
    <div className="flex items-center justify-between gap-6 py-1 text-[14px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums text-foreground">
        {formatTokens(bucket.total_tokens)}
        {cacheLabel != null && (
          <span className="ml-1.5 text-muted-foreground" title="Prompt cache 命中率（cache_read / input）">
            · {cacheLabel} cache
          </span>
        )}
      </span>
    </div>
  );
}

interface Props {
  usage: UsageScopes;
  className?: string;
  compact?: boolean;
  /** Stacked layout for the conversation sidebar footer. */
  variant?: "inline" | "sidebar" | "rail";
}

export function UsageMeter({ usage, className, compact, variant = "inline" }: Props) {
  const turn = usage.turn;
  const conversation = usage.conversation;
  const project = usage.project;

  if (variant === "rail") {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/analytics"
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                className,
              )}
              aria-label="用量统计"
            >
              <Coins className="size-3.5" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="w-64 p-3">
            <div className="mb-1.5 text-[13px] font-medium text-foreground">用量</div>
            <ScopeLine label="本项目" bucket={project} showCache />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (variant === "sidebar") {
    const projectCache = formatCacheRate(project);
    return (
      <div className={cn("space-y-1 text-[12px] text-muted-foreground", className)} aria-label="用量统计">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1">
            <Coins className="size-3 shrink-0" />
            本项目
          </span>
          <span
            className="font-mono tabular-nums text-foreground"
            title={
              projectCache != null
                ? `Prompt cache 命中率 ${projectCache}（cache_read / input）`
                : undefined
            }
          >
            {formatTokens(project.total_tokens)}
            {projectCache != null && (
              <span className="ml-1.5 text-muted-foreground">{projectCache} cache</span>
            )}
          </span>
        </div>
        <Link to="/analytics" className="mt-1 block text-[12px] text-primary hover:underline">
          用量分析 →
        </Link>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 text-[13px] text-muted-foreground",
              className,
            )}
            aria-label="用量统计"
          >
            <Coins className="size-3 shrink-0" />
            {compact ? (
              <span className="font-mono tabular-nums">
                本轮 {formatTokens(turn.total_tokens)}
              </span>
            ) : (
              <span className="flex items-center gap-2 font-mono tabular-nums">
                <span title="本轮">轮 {formatTokens(turn.total_tokens)}</span>
                <span className="text-border">|</span>
                <span title="本对话">话 {formatTokens(conversation.total_tokens)}</span>
                <span className="text-border">|</span>
                <span title="本项目">项 {formatTokens(project.total_tokens)}</span>
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="w-64 p-3">
          <div className="mb-2 text-[14px] font-medium text-foreground">Token 用量</div>
          <ScopeLine label="本轮" bucket={turn} />
          <ScopeLine label="本对话" bucket={conversation} />
          <ScopeLine label="本项目" bucket={project} showCache />
          {(turn.by_model?.length ?? 0) > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              <div className="mb-1 text-[13px] text-muted-foreground">本轮按模型</div>
              {turn.by_model.map((m) => (
                <div key={m.model} className="flex justify-between gap-3 py-0.5 text-[13px]">
                  <span className="truncate text-muted-foreground">{m.model}</span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {formatTokens(m.total_tokens)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Link
            to="/analytics"
            className="mt-2 block text-[13px] text-primary hover:underline"
          >
            查看用量分析 →
          </Link>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { formatTokens };
