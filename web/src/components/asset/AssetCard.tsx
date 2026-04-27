"use client";

import Image from "next/image";
import Link from "next/link";
import { GitFork, Layers, Sparkles } from "lucide-react";
import type { Asset } from "@/lib/types";
import { isAssetFull } from "@/lib/guards";
import { cn } from "@/lib/utils";
import { ProceduralPlaceholder } from "./ProceduralPlaceholder";

type Variant = "grid" | "compact";

const coverW = 400;

export function AssetCard({
  asset,
  variant = "grid",
  className,
  href,
}: {
  asset: Asset;
  variant?: Variant;
  className?: string;
  href: string;
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
        <p className="text-ui-mono text-[12px] text-text-muted/70 line-through">已删除的公开素材</p>
        {asset.forkedFromId && (
          <p className="text-ui-mono mt-2 text-[11px] text-text-muted/50">仍可追溯 fork 自：{asset.forkedFromId}</p>
        )}
      </div>
    );
  }

  const full = asset;
  const imgs = full.images ?? [];
  const cover = full.coverImageId
    ? imgs.find((i) => i.id === full.coverImageId) ?? imgs[0]
    : imgs[0];
  const coverUrl = cover
    ? cover.url.includes("?")
        ? cover.url
        : `${cover.url}${cover.url.includes("picsum") ? "" : `?w=${coverW}`}`
    : null;

  if (variant === "compact") {
    return (
      <Link
        href={href}
        className={cn(
          "group flex h-16 items-stretch gap-2 rounded-md border border-border bg-surface/90 transition-none hover:-translate-y-0.5 hover:border-accent/40",
          className
        )}
      >
        <div className="relative h-12 w-12 shrink-0 self-center overflow-hidden rounded-sm">
          {coverUrl ? (
            <Image src={coverUrl} alt="" width={48} height={48} className="h-full w-full object-cover" unoptimized />
          ) : (
            <ProceduralPlaceholder seed={full.id} className="!h-12 !w-12" />
          )}
        </div>
        <div className="min-w-0 flex-1 py-1">
          <h3 className="font-display line-clamp-1 text-left text-sm text-text-primary">{full.name}</h3>
          <p className="line-clamp-1 text-left text-[11px] text-text-muted">{full.description}</p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "group relative block overflow-hidden rounded-md border border-border bg-surface transition-none hover:-translate-y-0.5 hover:border-[rgba(0,255,178,0.35)]",
        className
      )}
    >
      <div className="relative aspect-[4/3] w-full">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, 25vw"
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
        <h3 className="font-display line-clamp-1 text-lg text-text-primary leading-tight">{full.name}</h3>
        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-text-muted">{full.description}</p>
      </div>
      {isAssetFull(full) && full.forkCount > 0 && (
        <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-bg-base/80 opacity-0 transition-opacity group-hover:opacity-100">
          <Layers className="h-3.5 w-3.5 text-accent" aria-label="有衍生" />
        </div>
      )}
      <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-2 text-[11px] text-ui-mono text-text-muted/80">
        <span className="truncate">@{full.authorId.replace("user-", "")}</span>
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <GitFork className="h-3.5 w-3.5" />
          <Sparkles className="h-3.5 w-3.5 text-ai-violet" />
        </div>
      </div>
    </Link>
  );
}
