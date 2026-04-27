"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { isAssetFull } from "@/lib/guards";
import type { Asset } from "@/lib/types";
import { getAsset } from "@/lib/api";

function useForkSourceLabel(forkedFromId: string | null) {
  return useQuery({
    queryKey: ["asset", forkedFromId, "fork-label"],
    queryFn: () => getAsset(forkedFromId!),
    enabled: Boolean(forkedFromId),
    staleTime: 60_000,
  });
}

function forkSourceName(full: ReturnType<typeof useForkSourceLabel>["data"]): {
  name: string;
  href: string;
  isDeleted: boolean;
} {
  if (!full) return { name: "…", href: "#", isDeleted: false };
  if (full.visibility === "deleted")
    return { name: "已删除的素材", href: "#", isDeleted: true };
  if (isAssetFull(full)) return { name: full.name, href: `/library/assets/${full.id}`, isDeleted: false };
  return { name: "素材", href: "/explore", isDeleted: false };
}

export function ForkBadge({ asset, className }: { asset: Asset; className?: string }) {
  const forkId = isAssetFull(asset) ? asset.forkedFromId : null;
  const { data, isLoading, isError } = useForkSourceLabel(forkId);
  if (!isAssetFull(asset) || !asset.forkedFromId) return null;
  const { name, href, isDeleted } = forkSourceName(data ?? null);
  return (
    <p className={cn("text-ui-mono text-xs text-text-muted/80", className)}>
      <span className="text-accent/80">↑</span> 衍生自{" "}
      {isLoading && <span className="text-text-muted/60">加载中…</span>}
      {!isLoading && isError && (
        <span className="text-text-muted/60" title={asset.forkedFromId}>
          不可见或已删除
        </span>
      )}
      {!isLoading && !isError && (isDeleted || href === "#" ? (
        <span className="line-through text-text-muted/70">{name}</span>
      ) : (
        <Link href={href} className="text-accent/90 hover:underline">
          {name}
        </Link>
      ))}
    </p>
  );
}

export function GhostHint({ forkedFromId }: { forkedFromId: string | null }) {
  const { data, isLoading, isError } = useForkSourceLabel(forkedFromId);
  const { name, href, isDeleted } = forkSourceName(data ?? null);
  return (
    <p className="text-ui-mono text-xs text-text-muted/60">
      <span className="text-text-muted/50">衍生自 </span>
      {!forkedFromId && <span className="line-through">未知来源</span>}
      {forkedFromId && isLoading && <span className="line-through">加载中…</span>}
      {forkedFromId && !isLoading && isError && <span className="line-through">〔上游不可见〕</span>}
      {forkedFromId && !isLoading && !isError && (isDeleted || href === "#") && <span className="line-through">{name}</span>}
      {forkedFromId && !isLoading && !isError && !isDeleted && href !== "#" && (
        <Link href={href} className="text-accent/80 hover:underline">
          {name}
        </Link>
      )}
    </p>
  );
}

/** One line for list/deleted card: 仍可追溯 fork 自「名称」. */
export function ForkFromIdLine({ forkedFromId }: { forkedFromId: string }) {
  const { data, isLoading, isError } = useForkSourceLabel(forkedFromId);
  const { name, href, isDeleted } = forkSourceName(data ?? null);
  return (
    <p className="text-ui-mono mt-2 text-xs text-text-muted/50">
      仍可追溯 fork 自
      {isLoading && " …"}
      {!isLoading && isError && " 〔不可见〕"}
      {!isLoading && !isError && (isDeleted || href === "#" ? (
        <span className="text-text-muted/60">{name}</span>
      ) : (
        <Link href={href} className="text-accent/70 hover:underline">
          {name}
        </Link>
      ))}
    </p>
  );
}
