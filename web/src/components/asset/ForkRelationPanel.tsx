"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getForks } from "@/lib/api";
import type { ForkNode } from "@/lib/types";
import { cn } from "@/lib/utils";

function nodeRow(n: ForkNode) {
  const href = `/library/assets/${n.id}`;
  if (n.visibility === "deleted") {
    return (
      <p key={n.id} className="text-ui-mono text-xs text-text-muted/70 line-through">
        已删除的素材 <span className="font-mono text-xs">{n.id.slice(0, 8)}…</span>
      </p>
    );
  }
  return (
    <Link key={n.id} href={href} className="text-ui-mono block text-xs text-accent/90 hover:underline">
      {n.name || `素材 ${n.id.slice(0, 8)}…`}
    </Link>
  );
}

export function ForkRelationPanel({ assetId, className }: { assetId: string; className?: string }) {
  const { data: upstream } = useQuery({
    queryKey: ["forks", assetId, "upstream"],
    queryFn: () => getForks(assetId, "upstream"),
  });
  const { data: downstream } = useQuery({
    queryKey: ["forks", assetId, "downstream"],
    queryFn: () => getForks(assetId, "downstream"),
  });

  const up = upstream?.nodes ?? [];
  const down = downstream?.nodes ?? [];
  if (up.length === 0 && down.length === 0) return null;

  return (
    <div className={cn("space-y-3 border-t border-border/60 pt-3", className)}>
      <p className="text-ui-mono text-xs uppercase tracking-wider text-text-muted/80">Fork 关系</p>
      {up.length > 0 && (
        <div>
          <p className="text-ui-mono mb-1 text-xs text-text-muted">上游（直接来源）</p>
          <div className="space-y-1">{up.map(nodeRow)}</div>
        </div>
      )}
      {down.length > 0 && (
        <div>
          <p className="text-ui-mono mb-1 text-xs text-text-muted">下游（直接衍生）</p>
          <div className="space-y-1">{down.map(nodeRow)}</div>
        </div>
      )}
    </div>
  );
}
