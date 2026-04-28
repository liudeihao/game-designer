"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getAssets, linkProjectAsset, listAssetGroups } from "@/lib/api";
import { isAssetFull } from "@/lib/guards";
import type { AssetFull, ProjectLinkedAsset } from "@/lib/types";
import { ThemeSelect } from "@/components/ui/ThemeSelect";
import { cn } from "@/lib/utils";

type GroupFilter = "" | "ungrouped" | string;

export function LinkProjectAssetsDialog({
  projectId,
  open,
  onOpenChange,
  linkedAssets,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkedAssets: ProjectLinkedAsset[];
}) {
  const qc = useQueryClient();
  const linkedSet = useMemo(() => new Set(linkedAssets.map((a) => a.id)), [linkedAssets]);
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);

  const { data: groups } = useQuery({
    queryKey: ["asset-groups"],
    queryFn: listAssetGroups,
    enabled: open,
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 320);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebouncedQ("");
      setGroupFilter("");
      setSelected(new Set());
    }
  }, [open]);

  const groupIdParam =
    groupFilter === "" ? null : groupFilter === "ungrouped" ? "ungrouped" : groupFilter;

  const { data: page, isFetching } = useQuery({
    queryKey: ["link-project-assets-picker", groupIdParam, debouncedQ],
    queryFn: () =>
      getAssets("private", null, 200, {
        visibility: "private",
        groupId: groupIdParam,
        q: debouncedQ || null,
      }),
    enabled: open,
  });

  const items = useMemo(() => {
    const raw = page?.items ?? [];
    return raw.filter((a): a is AssetFull => isAssetFull(a) && a.visibility === "private");
  }, [page]);

  const groupOptions = useMemo(() => {
    const opts: { value: GroupFilter; label: string }[] = [
      { value: "", label: "全部分组" },
      { value: "ungrouped", label: "未分组" },
    ];
    for (const g of groups?.items ?? []) {
      opts.push({ value: g.id, label: g.name });
    }
    return opts;
  }, [groups]);

  const toggle = (id: string) => {
    if (linkedSet.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toAdd = useMemo(() => [...selected].filter((id) => !linkedSet.has(id)), [selected, linkedSet]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/70 data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content
          className={cn(
            "text-ui-mono fixed left-1/2 top-1/2 z-[101] flex max-h-[min(85vh,40rem)] w-[min(96vw,44rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-border bg-bg-base shadow-xl outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out"
          )}
        >
          <Dialog.Title className="shrink-0 border-b border-border/60 px-4 py-3 font-display text-lg text-text-primary">
            引用素材到项目
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            从「我的库」多选私有素材，名称与描述将纳入项目 AI 上下文。
          </Dialog.Description>
          <div className="flex shrink-0 flex-col gap-2 border-b border-border/40 px-4 py-2">
            <input
              type="search"
              className="text-ui-mono w-full rounded border border-border/70 bg-surface/40 px-2 py-1.5 text-[12px] text-text-primary outline-none focus:border-accent/50"
              placeholder="搜索名称或描述…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="搜索素材"
            />
            <ThemeSelect
              id="link-asset-group"
              aria-label="按素材库分组筛选"
              className="max-w-none text-[12px]"
              value={groupFilter}
              options={groupOptions.map((o) => ({ value: o.value, label: o.label }))}
              onValueChange={(v) => setGroupFilter((v || "") as GroupFilter)}
            />
          </div>
          <div className="gd-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {isFetching && items.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-text-muted">加载中…</p>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-text-muted">没有匹配的私有素材</p>
            ) : (
              <ul className="space-y-1">
                {items.map((a) => {
                  const isLinked = linkedSet.has(a.id);
                  const isSel = selected.has(a.id);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        disabled={isLinked}
                        onClick={() => toggle(a.id)}
                        className={cn(
                          "flex w-full items-start gap-2 rounded border px-2 py-2 text-left text-[12px] transition-colors",
                          isLinked
                            ? "cursor-not-allowed border-border/30 bg-surface/20 text-text-muted"
                            : isSel
                              ? "border-accent/45 bg-accent/10 text-text-primary"
                              : "border-border/50 hover:border-accent/25 hover:bg-surface/30"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                            isLinked
                              ? "border-border/50 bg-surface/40"
                              : isSel
                                ? "border-accent bg-accent/20 text-accent"
                                : "border-border/80"
                          )}
                          aria-hidden
                        >
                          {isLinked ? "✓" : isSel ? "✓" : ""}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-display text-[13px] text-text-primary">{a.name}</span>
                          <span className="mt-0.5 line-clamp-2 block text-[11px] text-text-muted">
                            {a.description}
                          </span>
                          {isLinked && (
                            <span className="mt-1 block text-[10px] text-accent/80">已在项目中引用</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded border border-border px-3 py-1.5 text-[12px] text-text-muted hover:text-text-primary"
              >
                取消
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={submitting || toAdd.length === 0}
              className="gd-btn-dataflow rounded border border-accent/50 bg-accent/15 px-3 py-1.5 text-[12px] text-accent disabled:cursor-not-allowed disabled:opacity-50"
              onClick={async () => {
                if (toAdd.length === 0 || submitting) return;
                setSubmitting(true);
                try {
                  for (const id of toAdd) {
                    await linkProjectAsset(projectId, id);
                  }
                  void qc.invalidateQueries({ queryKey: ["project", projectId] });
                  onOpenChange(false);
                } catch {
                  /* toast optional */
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? "添加中…" : `添加所选（${toAdd.length}）`}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
