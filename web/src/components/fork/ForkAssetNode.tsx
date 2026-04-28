"use client";

import Link from "next/link";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ForkGraphNode } from "@/lib/types";
import { imageDisplaySrc } from "@/lib/imageDisplaySrc";
import { cn } from "@/lib/utils";
import { ProceduralPlaceholder } from "@/components/asset/ProceduralPlaceholder";
import { FORK_NODE_HEIGHT, FORK_NODE_WIDTH } from "./forkGraphLayout";

export type ForkAssetNodeData = {
  graph: ForkGraphNode;
  isFocus: boolean;
  childCount: number;
  expanding: boolean;
  onExpand: () => void;
};

export function ForkAssetNode({ data }: NodeProps) {
  const { graph: n, isFocus, childCount, expanding, onExpand } = data as ForkAssetNodeData;
  const hidden = n.visibility === "private" && n.name === "";
  const deleted = n.visibility === "deleted";
  const coverUrl =
    n.coverImageUrl && !hidden
      ? n.coverImageUrl.includes("picsum")
        ? n.coverImageUrl
        : imageDisplaySrc(n.coverImageUrl, 240)
      : null;
  const showExpand = !hidden && !deleted && n.forkCount > childCount;
  /** No Link: others' private placeholders and deleted ghosts (avoid navigating to id-only ghost views from the graph). */
  const noDetailLink = hidden || deleted;

  const titleText = deleted ? "已删除" : hidden ? "不可见" : n.name || `素材 ${n.id.slice(0, 8)}…`;

  return (
    <div
      className={cn(
        "group/node relative overflow-hidden rounded-md border border-border bg-surface shadow-sm transition-none",
        isFocus && "ring-2 ring-ai-violet/55 ring-offset-2 ring-offset-bg-base",
        deleted && "border-dashed border-white/25 opacity-85"
      )}
      style={{ width: FORK_NODE_WIDTH, height: FORK_NODE_HEIGHT }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-text-muted/60" />
      {coverUrl && !hidden ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote asset URLs
        <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <ProceduralPlaceholder seed={n.id} className="absolute inset-0 h-full w-full" />
      )}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-[52%] bg-gradient-to-t from-surface via-surface/80 to-transparent"
        aria-hidden
      />
      <div className="absolute bottom-0 left-0 right-0 z-[5] flex flex-col justify-end p-2.5 pt-8">
        {noDetailLink ? (
          <span
            className="font-display line-clamp-2 cursor-default text-left text-sm leading-tight text-text-muted/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
            title={
              deleted
                ? "已删除素材仅在图中保留节点；若直接打开链接会看到简要说明而非完整详情"
                : "无权查看该私有素材，无法打开详情"
            }
          >
            {titleText}
          </span>
        ) : (
          <Link
            href={`/library/assets/${encodeURIComponent(n.id)}`}
            className="font-display line-clamp-2 text-left text-sm leading-tight text-ai-violet drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] hover:underline hover:text-ai-violet/95"
            onClick={(e) => e.stopPropagation()}
          >
            {titleText}
          </Link>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {n.visibility === "public" && (
            <span className="text-ui-mono rounded bg-accent/20 px-1 py-px text-xs uppercase tracking-wide text-accent drop-shadow-sm">
              全站
            </span>
          )}
          {n.visibility === "private" && (
            <span className="text-ui-mono rounded bg-black/35 px-1 py-px text-xs uppercase tracking-wide text-text-muted drop-shadow-sm">
              {hidden ? "私·无权" : "私"}
            </span>
          )}
          {n.visibility === "deleted" && (
            <span className="text-ui-mono rounded bg-white/10 px-1 py-px text-xs text-text-muted">已删</span>
          )}
        </div>
        {showExpand && (
          <button
            type="button"
            disabled={expanding}
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
            className="text-ui-mono mt-1 w-full truncate text-left text-xs text-ai-violet/95 hover:underline hover:text-ai-violet disabled:opacity-50"
          >
            {expanding ? "加载中…" : `+ 子分支 (${n.forkCount - childCount})`}
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-text-muted/60" />
    </div>
  );
}
