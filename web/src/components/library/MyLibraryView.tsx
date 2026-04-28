"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, List, Plus, Search, Settings } from "lucide-react";
import { useState, useCallback, useLayoutEffect, useMemo, useEffect } from "react";
import { AssetGrid } from "@/components/asset/AssetGrid";
import { LibraryStashBar } from "@/components/library/LibraryStash";
import { useUiPreferences } from "@/components/providers/UiPreferencesProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { PaginatedAssets } from "@/lib/types";
import type { AssetListFilters } from "@/lib/api";
import { listAssetGroups, createAssetGroup, deleteAssetGroup, listAssetTags } from "@/lib/api";
import { mergeLibraryHref, parseToolbarTokens } from "@/lib/library-query";
import { cn } from "@/lib/utils";
import { WorkspaceHorizontalSplit } from "@/components/shell/WorkspaceHorizontalSplit";
import type { GridCardSize } from "@/components/asset/AssetCard";

type Props = {
  initialData: PaginatedAssets;
  libraryVisibility: "private" | "public" | null;
};

const LIBRARY_CARD_SIZES = ["none", "sm", "md", "lg"] as const satisfies readonly GridCardSize[];

/** Tailwind `lg` default (keep in sync with breakpoints). */
const LG_MIN_PX = 1024;

export function MyLibraryView({ initialData, libraryVisibility }: Props) {
  const sp = useSearchParams();
  const router = useRouter();
  const group = sp.get("group") || "";
  const sortParam = sp.get("sort")?.trim() || "created_desc";
  const qParam = sp.get("q")?.trim() || "";
  const tagIdParam = sp.get("tagId")?.trim() || "";
  const hasImageParam = sp.get("hasImage") === "true";
  const linkToProject = sp.get("linkToProject")?.trim() || undefined;
  const assetDetailSearch = linkToProject
    ? `linkToProject=${encodeURIComponent(linkToProject)}`
    : undefined;
  const { prefs, setPrefs } = useUiPreferences();
  const qc = useQueryClient();
  const [sidebarWide, setSidebarWide] = useState(true);
  useLayoutEffect(() => {
    const mq = window.matchMedia(`(min-width: ${LG_MIN_PX}px)`);
    const sync = () => setSidebarWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const { data: groupData, refetch: refetchGroups } = useQuery({
    queryKey: ["asset-groups"],
    queryFn: listAssetGroups,
  });
  const { data: tagCloud } = useQuery({
    queryKey: ["asset-tags"],
    queryFn: listAssetTags,
  });

  const assetListFilters: AssetListFilters = useMemo(
    () => ({
      sort: sortParam,
      q: qParam || undefined,
      tagId: tagIdParam || undefined,
      hasImage: hasImageParam ? true : undefined,
    }),
    [sortParam, qParam, tagIdParam, hasImageParam]
  );

  const [searchDraft, setSearchDraft] = useState(qParam);
  useEffect(() => setSearchDraft(qParam), [qParam]);
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingGroupName, setPendingGroupName] = useState("");

  const items = groupData?.items ?? [];
  const activeAll = !group;
  const activeUngrouped = group === "ungrouped";
  const activeGroup = group && group !== "ungrouped" ? group : null;

  const visActive: "all" | "private" | "public" = libraryVisibility === null ? "all" : libraryVisibility;

  const hrefFor = useCallback(
    (g: string | null) =>
      mergeLibraryHref(sp, {
        group: g === null ? null : g === "ungrouped" ? "ungrouped" : g,
      }),
    [sp]
  );
  const hrefVis = useCallback(
    (v: "all" | "private" | "public") =>
      mergeLibraryHref(sp, {
        vis: v === "all" ? "all" : v === "public" ? "public" : null,
      }),
    [sp]
  );

  const applySearch = useCallback(() => {
    const parsed = parseToolbarTokens(searchDraft);
    const patch: Record<string, string | null | undefined> = {
      q: parsed.remainder || null,
    };
    if (parsed.tagHints.length > 0) {
      const want = parsed.tagHints[0].toLowerCase();
      const hit = tagCloud?.items?.find((t) => t.name.toLowerCase() === want);
      patch.tagId = hit?.id ?? null;
    }
    if (parsed.hasImage === true) patch.hasImage = "true";
    else if (parsed.hasImage === false) patch.hasImage = null;
    router.replace(mergeLibraryHref(sp, patch));
  }, [searchDraft, sp, router, tagCloud]);

  const sidebar = (
    <aside className="gd-scrollbar box-border flex h-full min-h-0 w-full min-w-0 shrink-0 flex-col overflow-y-auto p-4">
        <p className="text-ui-mono text-xs uppercase tracking-wider text-text-muted">范围</p>
        <ul className="mt-1 space-y-0.5 text-ui-mono text-sm text-text-primary">
          <li>
            <Link
              href={hrefVis("all")}
              className={cn("block rounded px-2 py-1.5", visActive === "all" && "bg-accent/10 text-accent")}
              title="仅自己与已上探索的条目（两类可见性不同）"
            >
              全部
            </Link>
          </li>
          <li>
            <Link
              href={hrefVis("private")}
              className={cn("block rounded px-2 py-1.5", visActive === "private" && "bg-accent/10 text-accent")}
              title="仅自己可见，未在探索中展示"
            >
              仅自己可见
            </Link>
          </li>
          <li>
            <Link
              href={hrefVis("public")}
              className={cn("block rounded px-2 py-1.5", visActive === "public" && "bg-accent/10 text-accent")}
              title="已出现在全站「探索」中，所有用户可浏览"
            >
              探索中（全站）
            </Link>
          </li>
        </ul>
        <p className="text-ui-mono mt-4 text-xs uppercase tracking-wider text-text-muted">素材</p>
        <ul className="mt-2 space-y-0.5 text-ui-mono text-sm text-text-primary">
          <li>
            <Link
              href={hrefFor(null)}
              className={cn("block rounded px-2 py-1.5", activeAll && "bg-accent/10 text-accent")}
            >
              全部素材
            </Link>
          </li>
          <li>
            <Link
              href={hrefFor("ungrouped")}
              className={cn("block rounded px-2 py-1.5", activeUngrouped && "bg-accent/10 text-accent")}
            >
              未分组
            </Link>
          </li>
        </ul>
        {items.length > 0 && (
          <ul className="mt-1 space-y-0.5 border-t border-border/40 pt-2 text-ui-mono text-sm">
            {items.map((g) => (
              <li key={g.id} className="group/item flex items-center gap-0.5">
                <Link
                  href={hrefFor(g.id)}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded px-2 py-1.5",
                    activeGroup === g.id && "bg-accent/10 text-accent"
                  )}
                >
                  {g.name}
                </Link>
                <button
                  type="button"
                  title="删除分组"
                  className="shrink-0 rounded p-1 text-xs text-text-muted opacity-0 hover:text-error-dim group-hover/item:opacity-100"
                  onClick={() => setDeleteTarget({ id: g.id, name: g.name })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-ui-mono mt-4 text-xs uppercase tracking-wider text-text-muted">标签</p>
        <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-ui-mono text-xs text-text-primary">
          {(tagCloud?.items ?? []).slice(0, 24).map((t) => (
            <li key={t.id}>
              <Link
                href={mergeLibraryHref(sp, { tagId: tagIdParam === t.id ? null : t.id })}
                className={cn(
                  "flex items-center justify-between gap-1 rounded px-2 py-1",
                  tagIdParam === t.id ? "bg-accent/10 text-accent" : "hover:bg-surface/80"
                )}
              >
                <span className="truncate">{t.name}</span>
                <span className="shrink-0 text-xs text-text-muted">{t.assetCount}</span>
              </Link>
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex gap-1 border-t border-border/40 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = newName.trim();
            if (!n) return;
            setPendingGroupName(n);
            setCreateOpen(true);
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="新分组"
            className="min-w-0 flex-1 rounded border border-border/60 bg-surface/50 px-2 py-1 text-xs outline-none"
          />
          <button
            type="submit"
            className="shrink-0 rounded bg-accent/15 px-2 py-1 text-ui-mono text-xs text-accent"
            title="添加"
          >
            <Plus className="h-4 w-4" />
          </button>
        </form>
    </aside>
  );

  const mainScroll = (
    <>
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl">我的库</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="text-ui-mono flex items-center gap-1 text-xs text-text-muted"
            title="无：不显示缩略图；小/中/大：宫格下正方形封面尺寸"
          >
            <span>无</span>
            <input
              type="range"
              min={0}
              max={3}
              value={LIBRARY_CARD_SIZES.indexOf(prefs.libraryCardSize)}
              onChange={(e) => {
                const v = Number(e.target.value);
                setPrefs({ libraryCardSize: LIBRARY_CARD_SIZES[v] ?? "md" });
              }}
              className="h-1 w-24 accent-accent"
            />
            <span>大</span>
          </div>
          <Link
            href="/library/preferences"
            className="text-ui-mono inline-flex items-center gap-1 rounded border border-border/50 px-2 py-1 text-xs text-text-muted hover:text-text-primary"
          >
            <Settings className="h-3.5 w-3.5" />
            显示与字体
          </Link>
          <Link
            href="/library/assets/new"
            className="text-ui-mono rounded bg-accent/15 px-3 py-1.5 text-sm text-accent hover:bg-accent/25"
          >
            新建素材
          </Link>
        </div>
        </div>
        <div className="text-ui-mono flex flex-wrap items-center gap-2 rounded-md border border-border/45 bg-surface/35 px-2 py-2">
          <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
          <form
            className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              applySearch();
            }}
          >
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="全文，或 type:image、tag:名称"
              className="min-w-[12rem] flex-1 rounded border border-border/50 bg-bg-base/80 px-2 py-1.5 text-xs text-text-primary outline-none placeholder:text-text-muted/60"
            />
            <button
              type="submit"
              className="shrink-0 rounded border border-accent/35 bg-accent/10 px-2.5 py-1.5 text-xs text-accent hover:bg-accent/20"
            >
              检索
            </button>
          </form>
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            排序
            <select
              value={sortParam}
              className="rounded border border-border/50 bg-bg-base/80 px-1.5 py-1 text-xs text-text-primary"
              onChange={(e) => router.replace(mergeLibraryHref(sp, { sort: e.target.value || null }))}
            >
              <option value="created_desc">创建时间 ↓</option>
              <option value="updated_desc">最近修改 ↓</option>
              <option value="fork_desc">分叉次数 ↓</option>
            </select>
          </label>
          <div className="flex items-center gap-0.5 rounded border border-border/50 p-0.5">
            <button
              type="button"
              title="网格"
              className={cn(
                "rounded p-1.5",
                (prefs.libraryViewMode ?? "grid") === "grid" ? "bg-accent/15 text-accent" : "text-text-muted"
              )}
              onClick={() => setPrefs({ libraryViewMode: "grid" })}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="列表"
              className={cn(
                "rounded p-1.5",
                prefs.libraryViewMode === "list" ? "bg-accent/15 text-accent" : "text-text-muted"
              )}
              onClick={() => setPrefs({ libraryViewMode: "list" })}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <p className="text-ui-mono mb-3 text-xs text-text-muted/90">
        {visActive === "all" &&
          "私库素材与「探索」中的公开素材是两类：仅自己可见 vs 全站用户可见。侧栏可只筛一类。"}
        {visActive === "private" && "仅你可见的草稿与创作中素材，不会出现在全站「探索」。"}
        {visActive === "public" &&
          "这些已发布到全站「探索」库；任何用户都能看到，与私库不是同一套列表。角标为「全站」。"}
      </p>
      {linkToProject && (
        <div className="text-ui-mono mb-3 rounded border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-text-muted">
          正在为<strong className="text-text-primary">游戏项目</strong>引用素材：请点开<strong className="text-text-primary">仅自己可见</strong>
          的素材进入详情页，并点击「引用到项目」。完成后可回到项目「设计」页继续对话。
          <Link
            href={`/projects/${encodeURIComponent(linkToProject)}/design`}
            className="ml-2 text-accent hover:underline"
          >
            返回项目设计
          </Link>
        </div>
      )}
      <AssetGrid
        key={`${group || "all"}-${visActive}-${sortParam}-${qParam}-${tagIdParam}-${hasImageParam}`}
        scope="private"
        initialData={initialData}
        groupId={group || null}
        libraryVisibility={libraryVisibility}
        gridSize={prefs.libraryCardSize}
        ownerLibraryBulkDelete
        detailSearch={assetDetailSearch}
        viewMode={prefs.libraryViewMode ?? "grid"}
        assetListFilters={assetListFilters}
        stashDragPayload={(id, name) => JSON.stringify({ id, name })}
      />
    </>
  );

  const main = (
    <div className="gd-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-28 pt-6 lg:px-8">
      {mainScroll}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="删除分组？"
        description={deleteTarget ? `分组「${deleteTarget.name}」下的素材会移入「未分组」列表，此操作可稍后通过新建分组再整理。` : undefined}
        confirmLabel="删除"
        pendingLabel="删除中…"
        tone="danger"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteAssetGroup(deleteTarget.id);
          setDeleteTarget(null);
          void refetchGroups();
          void qc.invalidateQueries({ queryKey: ["assets", "private"] });
          if (activeGroup === deleteTarget.id) {
            router.replace(mergeLibraryHref(sp, { group: null }));
          }
        }}
      />
      <ConfirmDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="创建分组？"
        description={pendingGroupName ? `将创建「${pendingGroupName}」` : undefined}
        confirmLabel="创建"
        pendingLabel="创建中…"
        onConfirm={async () => {
          const n = pendingGroupName.trim();
          if (!n) return;
          await createAssetGroup(n);
          setNewName("");
          setCreateOpen(false);
          void refetchGroups();
        }}
      />
      {sidebarWide ? (
        <div className="flex min-h-0 min-w-0 flex-1">
          <WorkspaceHorizontalSplit
            storageKey="layout:library-sidebar"
            leftDefaultSize={17.5}
            leftMinSize={14}
            rightMinSize={40}
            className="min-h-0 min-w-0 flex-1"
            left={sidebar}
            right={main}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1">{main}</div>
      )}
      <LibraryStashBar />
    </div>
  );
}
