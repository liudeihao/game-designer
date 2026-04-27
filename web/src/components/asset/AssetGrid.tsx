"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getAssets } from "@/lib/api";
import type { PaginatedAssets } from "@/lib/types";
import { AssetCard, type GridCardSize } from "./AssetCard";
import { cn } from "@/lib/utils";
import type { LibraryViewMode } from "@/lib/ui-preferences";

/** Base path for detail links, e.g. "/library/assets" → href is `${base}/${id}`. Must be a string (not a function) so the grid can be used from RSC. */
const DEFAULT_ASSET_HREF_BASE = "/library/assets";

export function AssetGrid({
  scope,
  className,
  itemHrefBase = DEFAULT_ASSET_HREF_BASE,
  initialData,
  groupId,
  viewMode = "grid",
  gridSize = "md",
  libraryVisibility = null,
  libraryImageNo = false,
}: {
  scope: "public" | "private";
  className?: string;
  itemHrefBase?: string;
  initialData?: PaginatedAssets;
  /** Filter private list: group uuid, "ungrouped", or omit for all */
  groupId?: string | null;
  viewMode?: LibraryViewMode;
  gridSize?: GridCardSize;
  /** 我的库: 仅自己可见 / 探索中（全站） / 未指定=全部 */
  libraryVisibility?: "private" | "public" | null;
  /** 我的库: 仅无任何 asset_images 记录的素材 */
  libraryImageNo?: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const groupKey = groupId ?? "all";
  const visKey = libraryVisibility ?? "all";
  const imgKey = libraryImageNo ? "no" : "all";
  const showOwnerLibBadge = scope === "private";
  const q = useInfiniteQuery({
    queryKey: ["assets", scope, groupKey, visKey, imgKey],
    initialData:
      initialData != null
        ? {
            pages: [initialData],
            pageParams: [null as string | null],
          }
        : undefined,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      return getAssets(
        scope,
        pageParam as string | null,
        24,
        groupId ?? undefined,
        libraryVisibility ?? undefined,
        libraryImageNo || undefined
      );
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const v = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && q.hasNextPage && !q.isFetchingNextPage) {
          void q.fetchNextPage();
        }
      },
      { rootMargin: "200px" }
    );
    v.observe(el);
    return () => v.disconnect();
  }, [q]);

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const showQueryErr = q.isError && !q.isFetching;

  /** 宫格：flex 流式换行（左→右、自上而下），非 CSS multi-column / 非多列报版式。 */
  const flowItemW: Record<GridCardSize, string> = {
    sm: "w-full max-w-32 sm:w-32",
    md: "w-full max-w-48 sm:w-48",
    lg: "w-full max-w-64 sm:w-64",
  };

  const colClass =
    viewMode === "list"
      ? "flex flex-col gap-2"
      : cn("flex flex-wrap content-start items-start justify-start gap-4");

  return (
    <div className={cn("w-full", className)}>
      {showQueryErr && (
        <p className="text-ui-mono mb-3 rounded border border-error-dim/20 bg-surface/60 px-3 py-2 text-center text-[12px] text-text-muted">
          无法刷新列表。请检查网络或后端是否可用。
        </p>
      )}
      <div className={colClass}>
        {items.map((a) => (
          <div
            key={a.id}
            className={viewMode === "list" ? "" : cn("shrink-0", flowItemW[gridSize])}
          >
            <AssetCard
              asset={a}
              href={`${itemHrefBase}/${a.id}`}
              variant={viewMode === "list" ? "compact" : "grid"}
              gridSize={viewMode === "grid" ? gridSize : "md"}
              showOwnerLibraryBadge={showOwnerLibBadge}
            />
          </div>
        ))}
      </div>
      <div ref={sentinelRef} className="h-8" />
      {q.isFetching && !q.isFetchingNextPage && (
        <p className="text-ui-mono text-center text-[12px] text-text-muted">加载中…</p>
      )}
    </div>
  );
}
