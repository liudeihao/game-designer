"use client";

import Image from "next/image";
import Link from "next/link";
import { Layers } from "lucide-react";
import type { Asset } from "@/lib/types";
import { isAssetFull } from "@/lib/guards";
import { cn } from "@/lib/utils";
import { ProceduralPlaceholder } from "./ProceduralPlaceholder";
import { ForkFromIdLine } from "./ForkBadge";
import type { LibraryCardSize } from "@/lib/ui-preferences";

type Variant = "grid" | "compact";
export type GridCardSize = LibraryCardSize;

/** Request width for cover URL; matches typical display size per grid step. */
const coverWByGrid: Record<GridCardSize, number> = {
  none: 400,
  sm: 256,
  md: 400,
  lg: 512,
};

/** Square tile max edge (Tailwind); grid 下等比例缩放，窄列时随列宽缩小。 */
const gridCardMaxW: Record<GridCardSize, string> = {
  none: "max-w-56",
  sm: "max-w-32",
  md: "max-w-48",
  lg: "max-w-64",
};

export function AssetCard({
  asset,
  variant = "grid",
  gridSize = "md",
  className,
  href,
  showOwnerLibraryBadge,
}: {
  asset: Asset;
  variant?: Variant;
  /** 宫格封面正方形边长档位（小/中/大），仅 grid 变体。 */
  gridSize?: GridCardSize;
  className?: string;
  href: string;
  /** In 我的库: show 仅自己 / 全站 for the owner (contrast with platform-wide explore). */
  showOwnerLibraryBadge?: boolean;
}) {
  if (asset.visibility === "deleted") {
    return (
      <div
        className={cn(
          "group relative rounded-md border border-dashed border-white/20 bg-surface/50 p-3",
          variant === "grid" && "min-h-[200px]",
          className
        )}
      >
        <p className="text-ui-mono text-xs text-text-muted/70 line-through">已删除的公开素材</p>
        {asset.forkedFromId && <ForkFromIdLine forkedFromId={asset.forkedFromId} />}
      </div>
    );
  }

  const full = asset;
  const imgs = full.images ?? [];
  const cover = full.coverImageId
    ? imgs.find((i) => i.id === full.coverImageId) ?? imgs[0]
    : imgs[0];
  const showThumb = gridSize !== "none";
  const thumbReqW = variant === "compact" ? 96 : coverWByGrid[gridSize];
  const coverUrl = cover
    ? cover.url.includes("?")
        ? cover.url
        : `${cover.url}${cover.url.includes("picsum") ? "" : `?w=${thumbReqW}`}`
    : null;

  const visPill =
    showOwnerLibraryBadge && isAssetFull(full) ? (
      <span
        className={cn(
          "text-ui-mono shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide",
          full.visibility === "public"
            ? "bg-accent/15 text-accent"
            : "bg-white/6 text-text-muted"
        )}
        title={
          full.visibility === "public"
            ? "已在「探索」中，全站用户可见"
            : "仅自己可见，未在全站探索中展示"
        }
      >
        {full.visibility === "public" ? "全站" : "仅自己"}
      </span>
    ) : null;

  if (variant === "compact") {
    return (
      <Link
        href={href}
        className={cn(
          "group flex min-h-16 items-stretch gap-2 rounded-md border border-border bg-surface/90 transition-none hover:-translate-y-0.5 hover:border-accent/40",
          className
        )}
      >
        {showThumb && (
          <div className="relative h-12 w-12 shrink-0 self-center overflow-hidden rounded-sm">
            {coverUrl ? (
              <Image src={coverUrl} alt="" width={48} height={48} className="h-full w-full object-cover" unoptimized />
            ) : (
              <ProceduralPlaceholder seed={full.id} className="!h-12 !w-12" />
            )}
          </div>
        )}
        <div className="min-w-0 flex-1 py-1 pr-1">
          <div className="flex items-start gap-1.5">
            <h3 className="font-display min-w-0 flex-1 line-clamp-1 text-left text-sm text-text-primary">{full.name}</h3>
            {visPill}
          </div>
          <p className="line-clamp-1 text-left text-[11px] text-text-muted">{full.description}</p>
        </div>
      </Link>
    );
  }

  const titleCls = cn(
    "font-display line-clamp-1 text-text-primary leading-tight",
    (gridSize === "none" || gridSize === "sm") && "text-base",
    gridSize === "md" && "text-lg",
    gridSize === "lg" && "text-xl"
  );
  const descCls = cn(
    "mt-1 line-clamp-2 leading-relaxed text-text-muted",
    (gridSize === "none" || gridSize === "sm") && "text-[11px]",
    gridSize === "md" && "text-[12px]",
    gridSize === "lg" && "text-sm"
  );

  if (!showThumb) {
    return (
      <Link
        href={href}
        className={cn(
          "group relative mx-auto block w-full overflow-hidden rounded-md border border-border bg-surface/95 transition-none hover:-translate-y-0.5 hover:border-[rgba(0,255,178,0.35)]",
          gridCardMaxW[gridSize],
          className
        )}
      >
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className={cn("min-w-0 flex-1", titleCls)}>{full.name}</h3>
            {visPill}
          </div>
          <p className={descCls}>{full.description}</p>
        </div>
        {isAssetFull(full) && full.forkCount > 0 && (
          <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-bg-base/80 opacity-0 transition-opacity group-hover:opacity-100">
            <Layers className="h-3.5 w-3.5 text-accent" aria-label="有衍生" />
          </div>
        )}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "group relative mx-auto block w-full overflow-hidden rounded-md border border-border bg-surface transition-none hover:-translate-y-0.5 hover:border-[rgba(0,255,178,0.35)]",
        gridCardMaxW[gridSize],
        className
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-t-md">
        {visPill && (
          <div className="absolute left-2 top-2 z-10">{visPill}</div>
        )}
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 768px) 45vw, 200px"
            unoptimized
          />
        ) : (
          <ProceduralPlaceholder seed={full.id} className="absolute inset-0 h-full w-full" />
        )}
        <div
          className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-surface to-transparent"
          aria-hidden
        />
      </div>
      <div className="p-3">
        <h3 className={titleCls}>
          {full.name}
        </h3>
        <p className={descCls}>
          {full.description}
        </p>
      </div>
      {isAssetFull(full) && full.forkCount > 0 && (
        <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-bg-base/80 opacity-0 transition-opacity group-hover:opacity-100">
          <Layers className="h-3.5 w-3.5 text-accent" aria-label="有衍生" />
        </div>
      )}
    </Link>
  );
}
