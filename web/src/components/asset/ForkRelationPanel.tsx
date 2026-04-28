"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getForks } from "@/lib/api";
import type { ForkNode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProceduralPlaceholder } from "./ProceduralPlaceholder";

/** Request width for cover URL; matches compact AssetCard thumb. */
const thumbPx = 48;

function forkThumbSrc(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const u = url.trim();
  if (u.startsWith("data:") || u.startsWith("blob:")) return u;
  if (u.includes("?")) return u;
  if (u.includes("picsum")) return u;
  return `${u}?w=${thumbPx * 2}`;
}

function forkRelationTitle(n: ForkNode): string {
  if (n.visibility === "deleted") {
    return `已删除的素材 ${n.id.slice(0, 8)}…`;
  }
  const name = (n.name ?? "").trim();
  if (!name && n.visibility === "private") {
    return "非公开素材";
  }
  return name || `素材 ${n.id.slice(0, 8)}…`;
}

function ForkRelationRow({ n }: { n: ForkNode }) {
  const href = `/library/assets/${encodeURIComponent(n.id)}`;
  const title = forkRelationTitle(n);
  const thumb = forkThumbSrc(n.coverImageUrl ?? null);

  if (n.visibility === "deleted") {
    return (
      <div className="flex min-h-12 items-center gap-2 rounded-md border border-dashed border-white/15 bg-surface/50 px-2 py-1.5">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-sm opacity-70">
          <ProceduralPlaceholder seed={n.id} className="!h-12 !w-12" />
        </div>
        <p className="text-ui-mono min-w-0 flex-1 text-xs text-text-muted/70 line-through">{title}</p>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group flex min-h-12 items-center gap-2 rounded-md border border-border bg-surface/90 px-2 py-1.5 transition-none hover:-translate-y-0.5 hover:border-accent/40"
    >
      <div className="relative h-12 w-12 shrink-0 self-center overflow-hidden rounded-sm">
        {thumb ? (
          <Image
            src={thumb}
            alt=""
            width={thumbPx}
            height={thumbPx}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <ProceduralPlaceholder seed={n.id} className="!h-12 !w-12" />
        )}
      </div>
      <div className="min-w-0 flex-1 py-0.5 pr-1">
        <h3 className="font-display line-clamp-1 text-left text-sm text-text-primary group-hover:text-ai-violet group-hover:underline">
          {title}
        </h3>
      </div>
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
      <p className="text-ui-mono text-xs uppercase tracking-wider text-ai-violet/70">Fork 关系</p>
      {up.length > 0 && (
        <div>
          <p className="text-ui-mono mb-1 text-xs text-text-muted">上游（直接来源）</p>
          <div className="space-y-2">
            {up.map((n) => (
              <ForkRelationRow key={n.id} n={n} />
            ))}
          </div>
        </div>
      )}
      {down.length > 0 && (
        <div>
          <p className="text-ui-mono mb-1 text-xs text-text-muted">下游（直接衍生）</p>
          <div className="space-y-2">
            {down.map((n) => (
              <ForkRelationRow key={n.id} n={n} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
