"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getAssets } from "@/lib/api";
import type { Asset, PaginatedAssets } from "@/lib/types";
import { AssetCard } from "./AssetCard";
import { cn } from "@/lib/utils";

export function AssetGrid({
  scope,
  className,
  itemHref,
  initialData,
}: {
  scope: "public" | "private";
  className?: string;
  itemHref: (a: Asset) => string;
  initialData?: PaginatedAssets;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const q = useInfiniteQuery({
    queryKey: ["assets", scope],
    initialData:
      initialData != null
        ? {
            pages: [initialData],
            pageParams: [null as string | null],
          }
        : undefined,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      return getAssets(scope, pageParam as string | null, 24);
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
  return (
    <div className={cn("w-full", className)}>
      <div
        className="[column-fill:_balance] sm:columns-2 lg:columns-3 xl:columns-4"
        style={{ columnGap: "1rem" }}
      >
        {items.map((a) => (
          <div key={a.id} className="mb-4 break-inside-avoid">
            <AssetCard asset={a} href={itemHref(a)} />
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
