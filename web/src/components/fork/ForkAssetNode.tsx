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
        : `${n.coverImageUrl}${n.coverImageUrl.includes("picsum") ? "" : "?w=120"}`
      : null;
  const showExpand = !hidden && !deleted && n.forkCount > childCount;

  return (
    <div
      className={cn(
        "rounded-md border border-border/80 bg-surface/90 px-2 py-1.5 shadow-sm backdrop-blur-sm",
        isFocus && "ring-2 ring-accent/70",
        deleted && "border-dashed border-white/25 opacity-85"
      )}
      style={{ width: FORK_NODE_WIDTH, minHeight: FORK_NODE_HEIGHT }}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-text-muted/50" />
      <div className="flex gap-2">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-black/25">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote asset URLs
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ProceduralPlaceholder seed={n.id} className="h-full w-full" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/library/assets/${encodeURIComponent(n.id)}`}
            className="text-ui-mono line-clamp-2 text-[11px] text-accent/90 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {deleted ? "已删除" : hidden ? "不可见" : n.name || `素材 ${n.id.slice(0, 8)}…`}
          </Link>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {n.visibility === "public" && (
              <span className="text-ui-mono rounded bg-accent/15 px-1 py-px text-[9px] uppercase tracking-wide text-accent">
                全站
              </span>
            )}
            {n.visibility === "private" && !hidden && (
              <span className="text-ui-mono rounded bg-white/6 px-1 py-px text-[9px] uppercase tracking-wide text-text-muted">
                私
              </span>
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
              className="mt-1 text-left text-ui-mono text-[10px] text-accent/90 hover:underline disabled:opacity-50"
            >
              {expanding ? "加载中…" : `加载更多子分支 (${n.forkCount - childCount})`}
            </button>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-text-muted/50" />
    </div>
  );
}
