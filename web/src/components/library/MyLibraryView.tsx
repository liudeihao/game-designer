"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, List, Plus, Settings } from "lucide-react";
import { useState, useCallback } from "react";
import { AssetGrid } from "@/components/asset/AssetGrid";
import { useUiPreferences } from "@/components/providers/UiPreferencesProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { PaginatedAssets } from "@/lib/types";
import { listAssetGroups, createAssetGroup, deleteAssetGroup } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { GridCardSize } from "@/components/asset/AssetCard";

type Props = {
  initialData: PaginatedAssets;
  libraryVisibility: "private" | "public" | null;
};

function mapCardPref(s: "sm" | "md" | "lg"): GridCardSize {
  return s;
}

function buildLibraryHref(opts: { group?: string; vis?: "private" | "public" | "all" | null }) {
  const p = new URLSearchParams();
  if (opts.group === "ungrouped") p.set("group", "ungrouped");
  else if (opts.group) p.set("group", opts.group);
  if (opts.vis === "public") p.set("vis", "public");
  else if (opts.vis === "all") p.set("vis", "all");
  // private：默认不落参，与「进入我的库」缺省一致
  const s = p.toString();
  return s ? `/library/assets?${s}` : "/library/assets";
}

export function MyLibraryView({ initialData, libraryVisibility }: Props) {
  const sp = useSearchParams();
  const group = sp.get("group") || "";
  const { prefs, setPrefs } = useUiPreferences();
  const qc = useQueryClient();
  const { data: groupData, refetch: refetchGroups } = useQuery({
    queryKey: ["asset-groups"],
    queryFn: listAssetGroups,
  });
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
      buildLibraryHref({
        group: g ?? undefined,
        vis:
          libraryVisibility === null
            ? "all"
            : libraryVisibility === "public"
              ? "public"
              : null,
      }),
    [libraryVisibility]
  );
  const hrefVis = useCallback(
    (v: "all" | "private" | "public") =>
      buildLibraryHref({
        group: group || undefined,
        vis: v === "all" ? "all" : v === "public" ? "public" : null,
      }),
    [group]
  );

  return (
    <div className="flex min-h-screen">
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="删除分组？"
        description={deleteTarget ? `分组「${deleteTarget.name}」下的素材会移入「未分组」列表，此操作可稍后通过新建分组再整理。` : undefined}
        confirmLabel="删除"
        tone="danger"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteAssetGroup(deleteTarget.id);
          setDeleteTarget(null);
          void refetchGroups();
          void qc.invalidateQueries({ queryKey: ["assets", "private"] });
          if (activeGroup === deleteTarget.id) {
            window.location.href = buildLibraryHref({
              vis:
                libraryVisibility === null
                  ? "all"
                  : libraryVisibility === "public"
                    ? "public"
                    : null,
            });
          }
        }}
      />
      <ConfirmDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="创建分组？"
        description={pendingGroupName ? `将创建「${pendingGroupName}」` : undefined}
        confirmLabel="创建"
        onConfirm={async () => {
          const n = pendingGroupName.trim();
          if (!n) return;
          await createAssetGroup(n);
          setNewName("");
          setCreateOpen(false);
          void refetchGroups();
        }}
      />

      <aside className="hidden w-56 shrink-0 border-r border-divider p-4 lg:block">
        <p className="text-ui-mono text-[11px] uppercase tracking-wider text-text-muted">范围</p>
        <ul className="mt-1 space-y-0.5 text-ui-mono text-[13px] text-text-primary">
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
        <p className="text-ui-mono mt-4 text-[11px] uppercase tracking-wider text-text-muted">素材</p>
        <ul className="mt-2 space-y-0.5 text-ui-mono text-[13px] text-text-primary">
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
          <ul className="mt-1 space-y-0.5 border-t border-border/40 pt-2 text-ui-mono text-[13px]">
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
                  className="shrink-0 rounded p-1 text-[10px] text-text-muted opacity-0 hover:text-error-dim group-hover/item:opacity-100"
                  onClick={() => setDeleteTarget({ id: g.id, name: g.name })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
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
            className="min-w-0 flex-1 rounded border border-border/60 bg-surface/50 px-2 py-1 text-[12px] outline-none"
          />
          <button
            type="submit"
            className="shrink-0 rounded bg-accent/15 px-2 py-1 text-ui-mono text-[12px] text-accent"
            title="添加"
          >
            <Plus className="h-4 w-4" />
          </button>
        </form>
      </aside>
      <div className="min-w-0 flex-1 px-4 py-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl">我的库</h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-ui-mono flex items-center gap-0.5 rounded border border-border/50 p-0.5">
              <button
                type="button"
                title="宫格"
                onClick={() => setPrefs({ libraryViewMode: "grid" })}
                className={cn(
                  "rounded p-1.5",
                  prefs.libraryViewMode === "grid" ? "bg-surface text-accent" : "text-text-muted"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="列表"
                onClick={() => setPrefs({ libraryViewMode: "list" })}
                className={cn(
                  "rounded p-1.5",
                  prefs.libraryViewMode === "list" ? "bg-surface text-accent" : "text-text-muted"
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <div
              className="text-ui-mono flex items-center gap-1 text-[11px] text-text-muted"
              title="宫格下封面为正方形，三档为整体等比例放大/缩小"
            >
              <span>缩略</span>
              <input
                type="range"
                min={0}
                max={2}
                value={prefs.libraryCardSize === "sm" ? 0 : prefs.libraryCardSize === "md" ? 1 : 2}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPrefs({ libraryCardSize: v === 0 ? "sm" : v === 1 ? "md" : "lg" });
                }}
                className="h-1 w-20 accent-accent"
              />
              <span>大</span>
            </div>
            <Link
              href="/library/preferences"
              className="text-ui-mono inline-flex items-center gap-1 rounded border border-border/50 px-2 py-1 text-[11px] text-text-muted hover:text-text-primary"
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
        <p className="text-ui-mono mb-3 text-[11px] text-text-muted/90">
          {visActive === "all" &&
            "私库素材与「探索」中的公开素材是两类：仅自己可见 vs 全站用户可见。侧栏可只筛一类。"}
          {visActive === "private" && "仅你可见的草稿与创作中素材，不会出现在全站「探索」。"}
          {visActive === "public" &&
            "这些已发布到全站「探索」库；任何用户都能看到，与私库不是同一套列表。角标为「全站」。"}
        </p>
        <AssetGrid
          key={`${group || "all"}-${visActive}`}
          scope="private"
          initialData={initialData}
          groupId={group || null}
          libraryVisibility={libraryVisibility}
          viewMode={prefs.libraryViewMode}
          gridSize={mapCardPref(prefs.libraryCardSize)}
        />
      </div>
    </div>
  );
}
