"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, List, Plus, Settings } from "lucide-react";
import { AssetGrid } from "@/components/asset/AssetGrid";
import { useUiPreferences } from "@/components/providers/UiPreferencesProvider";
import type { PaginatedAssets } from "@/lib/types";
import { listAssetGroups, createAssetGroup, deleteAssetGroup } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { GridCardSize } from "@/components/asset/AssetCard";

type Props = { initialData: PaginatedAssets };

function mapCardPref(s: "sm" | "md" | "lg"): GridCardSize {
  return s;
}

export function MyLibraryView({ initialData }: Props) {
  const sp = useSearchParams();
  const group = sp.get("group") || "";
  const { prefs, setPrefs } = useUiPreferences();
  const qc = useQueryClient();
  const { data: groupData, refetch: refetchGroups } = useQuery({
    queryKey: ["asset-groups"],
    queryFn: listAssetGroups,
  });
  const [newName, setNewName] = useState("");

  const items = groupData?.items ?? [];
  const activeAll = !group;
  const activeUngrouped = group === "ungrouped";
  const activeGroup = group && group !== "ungrouped" ? group : null;

  const hrefFor = (g: string | null) => {
    if (!g) return "/library/assets";
    return `/library/assets?group=${encodeURIComponent(g)}`;
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-divider p-4 lg:block">
        <p className="text-ui-mono text-[11px] uppercase tracking-wider text-text-muted">素材</p>
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
                  onClick={async () => {
                    if (!confirm("删除后素材将移回「未分组」。")) return;
                    await deleteAssetGroup(g.id);
                    void refetchGroups();
                    void qc.invalidateQueries({ queryKey: ["assets", "private"] });
                    if (activeGroup === g.id) {
                      window.location.href = "/library/assets";
                    }
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-3 flex gap-1 border-t border-border/40 pt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const n = newName.trim();
            if (!n) return;
            try {
              await createAssetGroup(n);
              setNewName("");
              void refetchGroups();
            } catch {
              /* ignore */
            }
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
            <div className="text-ui-mono flex items-center gap-1 text-[11px] text-text-muted">
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
        <AssetGrid
          key={group || "all"}
          scope="private"
          initialData={initialData}
          groupId={group || null}
          viewMode={prefs.libraryViewMode}
          gridSize={mapCardPref(prefs.libraryCardSize)}
        />
      </div>
    </div>
  );
}
