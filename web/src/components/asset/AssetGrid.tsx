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
}: {
  scope: "public" | "private";
  className?: string;
  itemHrefBase?: string;
  initialData?: PaginatedAssets;
  /** Filter private list: group uuid, "ungrouped", or omit for all */
  groupId?: string | null;
  viewMode?: LibraryViewMode;
  gridSize?: GridCardSize;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const groupKey = groupId ?? "all";
  const q = useInfiniteQuery({
    queryKey: ["assets", scope, groupKey],
    initialData:
      initialData != null
        ? {
            pages: [initialData],
            pageParams: [null as string | null],
          }
        : undefined,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      return getAssets(scope, pageParam as string | null, 24, groupId ?? undefined);
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

  const colClass =
    viewMode === "list"
      ? "flex flex-col gap-2"
      : cn(
          "[column-fill:_balance] sm:columns-2",
          gridSize === "lg" && "lg:columns-2 xl:columns-3",
          (gridSize === "sm" || gridSize === "md") && "lg:columns-3 xl:columns-4"
        );

  return (
    <div className={cn("w-full", className)}>
      {showQueryErr && (
        <p className="text-ui-mono mb-3 rounded border border-error-dim/20 bg-surface/60 px-3 py-2 text-center text-[12px] text-text-muted">
          无法刷新列表。请检查网络或后端是否可用。
        </p>
      )}
      <div className={colClass} style={viewMode === "list" ? undefined : { columnGap: "1rem" }}>
        {items.map((a) => (
          <div key={a.id} className={viewMode === "list" ? "" : "mb-4 break-inside-avoid"}>
            <AssetCard
              asset={a}
              href={`${itemHrefBase}/${a.id}`}
              variant={viewMode === "list" ? "compact" : "grid"}
              gridSize={viewMode === "grid" ? gridSize : "md"}
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
