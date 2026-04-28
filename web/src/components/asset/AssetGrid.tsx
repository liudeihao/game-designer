"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { deleteAsset, getAssets, type AssetListFilters } from "@/lib/api";
import { isAssetFull } from "@/lib/guards";
import type { AssetFull, PaginatedAssets } from "@/lib/types";
import { AssetCard, type GridCardSize } from "./AssetCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";

/** Base path for detail links, e.g. "/library/assets" → href is `${base}/${id}`. Must be a string (not a function) so the grid can be used from RSC. */
const DEFAULT_ASSET_HREF_BASE = "/library/assets";

export function AssetGrid({
  scope,
  className,
  itemHrefBase = DEFAULT_ASSET_HREF_BASE,
  /** Appended as `?${detailSearch}` on detail links (no leading `?`). */
  detailSearch,
  initialData,
  groupId,
  gridSize = "md",
  libraryVisibility = null,
  ownerLibraryBulkDelete = false,
  authorUsername = null,
  cardInteraction = "link",
  onInspectAsset,
  viewMode = "grid",
  assetListFilters,
  stashDragPayload,
}: {
  scope: "public" | "private";
  className?: string;
  itemHrefBase?: string;
  detailSearch?: string;
  initialData?: PaginatedAssets;
  /** Filter private list: group uuid, "ungrouped", or omit for all */
  groupId?: string | null;
  gridSize?: GridCardSize;
  /** 我的库: 仅自己可见 / 探索中（全站） / 未指定=全部 */
  libraryVisibility?: "private" | "public" | null;
  /** 仅私库列表：多选与批量删除（仅「仅自己可见」素材可删） */
  ownerLibraryBulkDelete?: boolean;
  /** 公开列表：按作者 username 筛选（用户主页）；仅与 scope=public 共用 */
  authorUsername?: string | null;
  cardInteraction?: "link" | "inspector";
  onInspectAsset?: (id: string) => void;
  viewMode?: "grid" | "list";
  assetListFilters?: AssetListFilters;
  /** Enable drag payload for library stash (JSON string per card). */
  stashDragPayload?: (assetId: string, name: string) => string;
}) {
  const qc = useQueryClient();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const groupKey = groupId ?? "all";
  const visKey = libraryVisibility ?? "all";
  const authorKey = authorUsername ?? "";
  const sortKey = assetListFilters?.sort ?? "";
  const qKey = assetListFilters?.q ?? "";
  const tagKey = assetListFilters?.tagId ?? "";
  const hiKey = assetListFilters?.hasImage === true ? "1" : "";
  const showOwnerLibBadge = scope === "private";
  const showBulkToolbar = scope === "private" && ownerLibraryBulkDelete;
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const listFiltersMerged: AssetListFilters = {
    groupId: groupId ?? undefined,
    visibility: libraryVisibility ?? undefined,
    authorUsername: authorUsername ?? undefined,
    ...assetListFilters,
  };

  const q = useInfiniteQuery({
    queryKey: ["assets", scope, groupKey, visKey, authorKey, sortKey, qKey, tagKey, hiKey],
    initialData:
      initialData != null
        ? {
            pages: [initialData],
            pageParams: [null as string | null],
          }
        : undefined,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      return getAssets(scope, pageParam as string | null, 24, listFiltersMerged);
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

  const privateSelectable = useCallback(
    () => items.filter((a) => isAssetFull(a) && a.visibility === "private") as AssetFull[],
    [items]
  );

  useEffect(() => {
    if (!bulkMode) setSelectedIds([]);
  }, [bulkMode]);

  // Prune selection when the loaded page set changes. Depend on `q.data` (stable until the query
  // updates), not `items` — `flatMap` creates a new array every render and would retrigger this
  // effect forever; `setSelectedIds` would always get a new array reference from `.filter`.
  useEffect(() => {
    const pages = q.data?.pages;
    if (!pages) return;
    const ids = new Set(pages.flatMap((p) => p.items.map((a) => a.id)));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => ids.has(id));
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev;
      return next;
    });
  }, [q.data]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const selectedPrivate = selectedIds.filter((id) =>
    privateSelectable().some((a) => a.id === id)
  );
  const allPrivateIds = privateSelectable().map((a) => a.id);
  const allPrivateSelected =
    allPrivateIds.length > 0 && selectedPrivate.length === allPrivateIds.length;

  /** 宫格：flex 流式换行（左→右、自上而下），非 CSS multi-column / 非多列报版式。 */
  const flowItemW: Record<GridCardSize, string> = {
    none: "w-full max-w-56 sm:w-56",
    sm: "w-full max-w-32 sm:w-32",
    md: "w-full max-w-48 sm:w-48",
    lg: "w-full max-w-64 sm:w-64",
  };

  const colClass = "flex flex-wrap content-start items-start justify-start gap-4";

  const cardProps = (a: (typeof items)[number]) => ({
    asset: a,
    href: `${itemHrefBase}/${a.id}${detailSearch ? `?${detailSearch}` : ""}`,
    showOwnerLibraryBadge: showOwnerLibBadge,
    cardInteraction,
    onInspectorActivate:
      cardInteraction === "inspector" && onInspectAsset ? () => onInspectAsset(a.id) : undefined,
    stashDragData:
      stashDragPayload && isAssetFull(a)
        ? stashDragPayload(a.id, a.name)
        : undefined,
    libraryBulkSelect:
      showBulkToolbar && bulkMode && isAssetFull(a)
        ? {
            checked: selectedIds.includes(a.id),
            disabled: a.visibility !== "private",
            disabledReason: "已公开的素材不能从私库批量删除",
            onToggle: () => toggleSelect(a.id),
          }
        : undefined,
  });

  return (
    <div className={cn("w-full", className)}>
      {showBulkToolbar && (
        <>
          <div className="text-ui-mono mb-3 flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              className={cn(
                "rounded border px-2.5 py-1",
                bulkMode
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border/60 text-text-muted hover:border-accent/30 hover:text-text-primary"
              )}
              onClick={() => setBulkMode((v) => !v)}
            >
              {bulkMode ? "退出批量" : "批量管理"}
            </button>
            {bulkMode && (
              <>
                <span className="text-text-muted">
                  已选 <span className="text-accent">{selectedPrivate.length}</span> 条可删除
                  {privateSelectable().length < items.length && (
                    <span className="text-text-muted/70">（全站公开素材不可批量删除）</span>
                  )}
                </span>
                <button
                  type="button"
                  className="text-text-primary hover:text-accent disabled:opacity-40"
                  disabled={allPrivateIds.length === 0}
                  onClick={() =>
                    setSelectedIds(allPrivateSelected ? [] : [...allPrivateIds])
                  }
                >
                  {allPrivateSelected ? "取消全选" : "全选可删除"}
                </button>
                <button
                  type="button"
                  className="rounded border border-error-dim/30 bg-error-dim/10 px-2 py-1 text-error-dim/90 hover:bg-error-dim/15 disabled:opacity-40"
                  disabled={selectedPrivate.length === 0}
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  删除所选
                </button>
              </>
            )}
          </div>
          <ConfirmDialog
            open={bulkDeleteOpen}
            onOpenChange={(o) => !o && setBulkDeleteOpen(false)}
            title="删除所选素材？"
            description={`将 ${selectedPrivate.length} 条「仅自己可见」的素材移入已删除状态，列表中不再显示；已公开在全站「探索」的素材不能从此处删除。此操作不可撤销。`}
            confirmLabel="删除"
            pendingLabel="删除中…"
            tone="danger"
            onConfirm={async () => {
              try {
                for (const id of selectedPrivate) {
                  await deleteAsset(id);
                  void qc.removeQueries({ queryKey: ["asset", id] });
                }
                setBulkDeleteOpen(false);
                setSelectedIds([]);
                setBulkMode(false);
                void qc.invalidateQueries({ queryKey: ["assets"] });
              } catch (e) {
                window.alert(e instanceof Error ? e.message : "删除失败，请重试。");
                void qc.invalidateQueries({ queryKey: ["assets"] });
                throw e;
              }
            }}
          />
        </>
      )}
      {showQueryErr && (
        <p className="text-ui-mono mb-3 rounded border border-error-dim/20 bg-surface/60 px-3 py-2 text-center text-xs text-text-muted">
          无法刷新列表。请检查网络或后端是否可用。
        </p>
      )}
      {viewMode === "grid" ? (
        <div className={colClass}>
          {items.map((a) => (
            <div key={a.id} className={cn("shrink-0", flowItemW[gridSize])}>
              <AssetCard {...cardProps(a)} variant="grid" gridSize={gridSize} />
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-border/50 bg-surface/30">
          <ul className="divide-y divide-border/40">
            {items.map((a) => (
              <li key={a.id} className="flex min-h-14 items-stretch gap-2 p-2 hover:bg-surface/60">
                {showBulkToolbar && bulkMode && isAssetFull(a) && (
                  <div className="flex w-8 shrink-0 items-center justify-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer rounded border-border text-accent"
                      checked={selectedIds.includes(a.id)}
                      disabled={a.visibility !== "private"}
                      title={a.visibility !== "private" ? "已公开不可删除" : undefined}
                      onChange={() => toggleSelect(a.id)}
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <AssetCard
                    {...cardProps(a)}
                    variant="compact"
                    gridSize="md"
                    className="min-h-14 border-0 bg-transparent hover:translate-y-0"
                  />
                </div>
                {isAssetFull(a) && (
                  <div className="text-ui-mono hidden min-w-[13rem] shrink-0 flex-col justify-center gap-3 sm:flex">
                    <div className="flex flex-col gap-1 leading-snug">
                      <span className="text-[10px] uppercase tracking-wide text-text-muted/75">创建</span>
                      <span className="tabular-nums text-text-muted">
                        {new Date(a.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 leading-snug">
                      <span className="text-[10px] uppercase tracking-wide text-text-muted/75">更新</span>
                      <span className="tabular-nums text-text-muted">
                        {new Date(a.updatedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
                {isAssetFull(a) && (
                  <div className="text-ui-mono hidden w-28 shrink-0 items-center text-xs text-text-muted md:flex">
                    fork {a.forkCount}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div ref={sentinelRef} className="h-8" />
      {q.isFetching && !q.isFetchingNextPage && (
        <p className="text-ui-mono text-center text-xs text-text-muted">加载中…</p>
      )}
    </div>
  );
}
