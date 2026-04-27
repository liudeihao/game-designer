import Link from "next/link";
import { cn } from "@/lib/utils";
import { isAssetFull } from "@/lib/guards";
import type { Asset } from "@/lib/types";

export function ForkBadge({ asset, className }: { asset: Asset; className?: string }) {
  if (!isAssetFull(asset) || !asset.forkedFromId) return null;
  return (
    <p className={cn("text-ui-mono text-[11px] text-text-muted/80", className)}>
      <span className="text-accent/80">↑</span> 衍生自{" "}
      <Link href={`/library/assets/${asset.forkedFromId}`} className="text-accent/90 hover:underline">
        素材 {asset.forkedFromId.slice(0, 6)}…
      </Link>
    </p>
  );
}

export function GhostHint({ forkedFromId }: { forkedFromId: string | null }) {
  return (
    <p className="text-ui-mono text-[11px] text-text-muted/60 line-through">
      衍生自 {forkedFromId ? `[已删除的素材 #${forkedFromId.slice(0, 6)}]` : "未知来源"}
    </p>
  );
}
