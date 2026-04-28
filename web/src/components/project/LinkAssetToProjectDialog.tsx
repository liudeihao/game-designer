"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { linkProjectAsset, listProjects } from "@/lib/api";
import { cn } from "@/lib/utils";

export function LinkAssetToProjectDialog({
  assetId,
  open,
  onOpenChange,
}: {
  assetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: projects, isPending } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedId(null);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const list = projects ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, search]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [filtered]
  );

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
            引用到游戏项目
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            选择你的项目，将当前私有素材纳入该项目 AI 设计上下文的引用列表。
          </Dialog.Description>
          <p className="border-b border-border/40 px-4 py-2 text-xs leading-relaxed text-text-muted">
            仅<strong className="text-text-primary/90">私有素材</strong>可引用；引用后项目名称与描述会进入该项目设计会话的上下文（与项目侧「引用素材」相同）。
          </p>
          <div className="shrink-0 border-b border-border/40 px-4 py-2">
            <input
              type="search"
              className="text-ui-mono w-full rounded border border-border/70 bg-surface/40 px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50"
              placeholder="搜索项目名称…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="搜索项目"
            />
          </div>
          <div className="gd-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {isPending ? (
              <p className="py-8 text-center text-xs text-text-muted">加载中…</p>
            ) : sorted.length === 0 ? (
              <div className="space-y-3 py-8 text-center text-xs text-text-muted">
                <p>{(projects ?? []).length === 0 ? "你还没有任何项目。" : "没有匹配的项目。"}</p>
                {(projects ?? []).length === 0 && (
                  <Link
                    href="/projects"
                    className="inline-block text-accent hover:underline"
                    onClick={() => onOpenChange(false)}
                  >
                    去创建项目 →
                  </Link>
                )}
              </div>
            ) : (
              <ul className="space-y-1" role="listbox" aria-label="项目列表">
                {sorted.map((p) => {
                  const sel = selectedId === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={sel}
                        onClick={() => setSelectedId(p.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-xs transition-colors",
                          sel
                            ? "border-accent/45 bg-accent/10 text-text-primary"
                            : "border-border/50 hover:border-accent/25 hover:bg-surface/30"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]",
                            sel ? "border-accent bg-accent/20 text-accent" : "border-border/80"
                          )}
                          aria-hidden
                        >
                          {sel ? "●" : ""}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-display text-sm text-text-primary">{p.name}</span>
                          <span className="mt-0.5 block text-xs text-text-muted/85">
                            更新{" "}
                            {(() => {
                              try {
                                return new Date(p.updatedAt).toLocaleString("zh-CN", {
                                  month: "numeric",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                });
                              } catch {
                                return "";
                              }
                            })()}
                          </span>
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
                className="rounded border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
              >
                取消
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={submitting || !selectedId}
              className="gd-btn-dataflow rounded border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs text-accent disabled:cursor-not-allowed disabled:opacity-50"
              onClick={async () => {
                if (!selectedId || submitting) return;
                setSubmitting(true);
                try {
                  await linkProjectAsset(selectedId, assetId);
                  void qc.invalidateQueries({ queryKey: ["project", selectedId] });
                  toast.success("已引用到项目");
                  onOpenChange(false);
                } catch {
                  toast.error("引用失败（须为你的私有素材，且你为该项目负责人）");
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? "引用中…" : "引用到所选项目"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
