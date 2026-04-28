"use client";

import Link from "next/link";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ForkGraphNode } from "@/lib/types";
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
      ? n.coverImageUrl.includes("?")
        ? n.coverImageUrl
        : `${n.coverImageUrl}${n.coverImageUrl.includes("picsum") ? "" : "?w=240"}`
      : null;
  const showExpand = !hidden && !deleted && n.forkCount > childCount;

  const titleText = deleted ? "已删除" : hidden ? "不可见" : n.name || `素材 ${n.id.slice(0, 8)}…`;

  return (
    <div
      className={cn(
        "group/node relative overflow-hidden rounded-md border border-border bg-surface shadow-sm transition-none",
        isFocus && "ring-2 ring-accent/70 ring-offset-2 ring-offset-bg-base",
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
        <Link
          href={`/library/assets/${encodeURIComponent(n.id)}`}
          className={cn(
            "font-display line-clamp-2 text-left text-[13px] leading-tight text-text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]",
            !hidden && !deleted && "text-accent/95 hover:underline"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {titleText}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {n.visibility === "public" && (
            <span className="text-ui-mono rounded bg-accent/20 px-1 py-px text-[9px] uppercase tracking-wide text-accent drop-shadow-sm">
              全站
            </span>
          )}
          {n.visibility === "private" && (
            <span className="text-ui-mono rounded bg-black/35 px-1 py-px text-[9px] uppercase tracking-wide text-text-muted drop-shadow-sm">
              {hidden ? "私·无权" : "私"}
            </span>
          )}
          {n.visibility === "deleted" && (
            <span className="text-ui-mono rounded bg-white/10 px-1 py-px text-[9px] text-text-muted">已删</span>
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
            className="text-ui-mono mt-1 w-full truncate text-left text-[10px] text-accent/95 hover:underline disabled:opacity-50"
          >
            {expanding ? "加载中…" : `+ 子分支 (${n.forkCount - childCount})`}
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-text-muted/60" />
    </div>
  );
}
