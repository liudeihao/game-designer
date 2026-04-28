"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, MoreVertical, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  createProjectSession,
  deleteSession,
  getProject,
  listProjectSessions,
  patchSession,
  unlinkProjectAsset,
} from "@/lib/api";
import type { ProjectDetail, ProjectSessionSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LinkProjectAssetsDialog } from "@/components/project/LinkProjectAssetsDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  sessionSidebarNavListClass,
  sessionSidebarSessionLinkClass,
} from "@/components/session/sessionSidebarNavStyles";
import {
  readProjectPinnedSessionIds,
  sortSessionsByPinnedOrder,
  togglePinnedId,
  writeProjectPinnedSessionIds,
} from "@/components/session/sessionSidebarPinned";

const iconBtn =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-white/5 hover:text-text-primary disabled:opacity-40";

function linkedThumbLabel(name: string): string {
  const s = name.trim();
  if (!s) return "?";
  const ch = [...s][0];
  return ch ?? "?";
}

const sessionOverflowMenuClass =
  "text-ui-mono z-[200] min-w-[9.5rem] rounded-md border border-border bg-bg-base p-1 shadow-lg";

const tabBtn =
  "text-ui-mono flex-1 rounded-md px-2 py-1.5 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-accent/40";

export function ProjectDesignSidebar({
  projectId,
  sessionId,
  streaming,
}: {
  projectId: string;
  sessionId: string;
  streaming: boolean;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: threads = [] } = useQuery({
    queryKey: ["project-sessions", projectId],
    queryFn: () => listProjectSessions(projectId),
  });
  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
  });
  const linked = useMemo(
    () => (project as ProjectDetail | null | undefined)?.linkedAssets ?? [],
    [project]
  );

  const [sidebarTab, setSidebarTab] = useState<"sessions" | "assets">("sessions");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linkedQuery, setLinkedQuery] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [inlineRename, setInlineRename] = useState<{ id: string; value: string } | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<ProjectSessionSummary | null>(null);
  const [pinnedSessionIds, setPinnedSessionIds] = useState<string[]>([]);

  useEffect(() => {
    setPinnedSessionIds(readProjectPinnedSessionIds(projectId));
  }, [projectId]);

  const sortedThreads = useMemo(
    () => sortSessionsByPinnedOrder(threads, pinnedSessionIds),
    [threads, pinnedSessionIds]
  );

  const linkedFiltered = useMemo(() => {
    const q = linkedQuery.trim().toLowerCase();
    if (!q) return linked;
    return linked.filter((a) => {
      const name = a.name.toLowerCase();
      const desc = a.description.toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [linked, linkedQuery]);

  const persistProjectPins = (next: string[]) => {
    setPinnedSessionIds(next);
    writeProjectPinnedSessionIds(projectId, next);
  };

  const onRenameKeyDown = (e: KeyboardEvent, sid: string) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setInlineRename(null);
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void commitRename(sid);
    }
  };

  const commitRename = async (sid: string) => {
    if (!inlineRename || inlineRename.id !== sid) return;
    const v = inlineRename.value.trim();
    if (!v || renameBusy) return;
    setRenameBusy(true);
    try {
      await patchSession(sid, { title: v });
      setInlineRename(null);
      void qc.invalidateQueries({ queryKey: ["project-sessions", projectId] });
      void qc.invalidateQueries({ queryKey: ["session", sid] });
    } catch {
      /* ignore */
    } finally {
      setRenameBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-0 bg-bg-base/50">
      <ConfirmDialog
        open={!!sessionToDelete}
        onOpenChange={(o) => !o && setSessionToDelete(null)}
        title="删除此设计会话？"
        description={
          sessionToDelete
            ? `「${sessionToDelete.title}」及其聊天记录将被永久删除。项目设计会话不使用素材库侧栏式「暂存」。此操作不可撤销。`
            : ""
        }
        confirmLabel="删除"
        tone="danger"
        pendingLabel="删除中…"
        onConfirm={async () => {
          if (!sessionToDelete) return;
          const sid = sessionToDelete.id;
          const remaining = threads.filter((t) => t.id !== sid);
          await deleteSession(sid);
          setSessionToDelete(null);
          if (pinnedSessionIds.includes(sid)) {
            persistProjectPins(pinnedSessionIds.filter((id) => id !== sid));
          }
          void qc.invalidateQueries({ queryKey: ["project-sessions", projectId] });
          void qc.removeQueries({ queryKey: ["session", sid] });
          if (sessionId === sid) {
            if (remaining.length > 0) {
              router.push(`/projects/${projectId}/design/${remaining[0].id}`);
            } else {
              router.push(`/projects/${projectId}/settings`);
            }
          }
        }}
      />

      <div className="shrink-0 border-b border-border/50 px-2 pt-2 pb-1">
        <div className="flex gap-1 rounded-lg bg-surface/25 p-1" role="tablist" aria-label="设计侧栏">
          <button
            type="button"
            role="tab"
            aria-selected={sidebarTab === "sessions"}
            className={cn(
              tabBtn,
              sidebarTab === "sessions"
                ? "border border-accent/30 bg-accent/10 text-accent"
                : "border border-transparent text-text-muted hover:text-text-primary"
            )}
            onClick={() => setSidebarTab("sessions")}
          >
            会话
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sidebarTab === "assets"}
            className={cn(
              tabBtn,
              sidebarTab === "assets"
                ? "border border-accent/30 bg-accent/10 text-accent"
                : "border border-transparent text-text-muted hover:text-text-primary"
            )}
            onClick={() => setSidebarTab("assets")}
          >
            引用素材
            {linked.length > 0 ? (
              <span className="ml-1 tabular-nums text-[10px] opacity-80">({linked.length})</span>
            ) : null}
          </button>
        </div>
      </div>

      {sidebarTab === "sessions" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-3 pb-2 pt-2">
            <button
              type="button"
              disabled={streaming}
              className="font-display w-full rounded-xl border border-accent/35 bg-accent/10 px-3 py-2.5 text-sm text-accent hover:bg-accent/15 disabled:opacity-50"
              onClick={async () => {
                const s = await createProjectSession(projectId, {});
                void qc.invalidateQueries({ queryKey: ["project-sessions", projectId] });
                router.push(`/projects/${projectId}/design/${s.id}`);
              }}
            >
              + 新会话
            </button>
          </div>
          <div className="gd-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <ul className={sessionSidebarNavListClass}>
              {sortedThreads.map((s) => {
                const active = s.id === sessionId;
                const editing = inlineRename?.id === s.id;
                const isPinned = pinnedSessionIds.includes(s.id);
                return (
                  <li key={s.id}>
                    <div className="group flex min-w-0 items-center gap-0.5">
                      {editing ? (
                        <input
                          autoFocus
                          disabled={renameBusy}
                          className="text-ui-mono min-w-0 flex-1 rounded-xl border border-accent/40 bg-surface/60 px-3 py-2 text-[15px] text-text-primary outline-none focus:border-accent"
                          value={inlineRename.value}
                          maxLength={200}
                          aria-label="会话名称"
                          onChange={(e) => setInlineRename({ id: s.id, value: e.target.value })}
                          onKeyDown={(e) => onRenameKeyDown(e, s.id)}
                        />
                      ) : (
                        <Link
                          href={`/projects/${projectId}/design/${s.id}`}
                          title={s.title}
                          className={cn("font-display", sessionSidebarSessionLinkClass(active))}
                        >
                          <span className="min-w-0 truncate">{s.title}</span>
                        </Link>
                      )}
                      {editing ? (
                        <>
                          <button
                            type="button"
                            className={iconBtn}
                            title="保存"
                            aria-label="保存名称"
                            disabled={renameBusy || !inlineRename?.value.trim()}
                            onClick={() => void commitRename(s.id)}
                          >
                            <Check className="h-4 w-4 text-accent" />
                          </button>
                          <button
                            type="button"
                            className={iconBtn}
                            title="取消"
                            aria-label="取消"
                            disabled={renameBusy}
                            onClick={() => setInlineRename(null)}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <DropdownMenu.Root modal={false}>
                          <DropdownMenu.Trigger asChild>
                            <button
                              type="button"
                              className={cn(iconBtn, "text-text-muted/80 hover:text-text-primary")}
                              aria-label={`「${s.title}」更多操作`}
                              disabled={streaming}
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" aria-hidden />
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              className={sessionOverflowMenuClass}
                              sideOffset={4}
                              align="end"
                              collisionPadding={8}
                            >
                              <DropdownMenu.Item
                                className="cursor-pointer rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-white/5"
                                disabled={streaming}
                                onSelect={() =>
                                  persistProjectPins(togglePinnedId(pinnedSessionIds, s.id))
                                }
                              >
                                {isPinned ? "取消固定" : "固定"}
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="cursor-pointer rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-white/5"
                                disabled={streaming}
                                onSelect={() => setInlineRename({ id: s.id, value: s.title })}
                              >
                                重命名
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="cursor-pointer rounded px-2 py-1.5 text-sm text-error-dim outline-none data-[highlighted]:bg-white/5"
                                disabled={streaming}
                                onSelect={() => setSessionToDelete(s)}
                              >
                                删除
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-3 py-3" role="tabpanel">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-text-muted">已引用</p>
            {linked.length > 0 ? (
              <span className="text-ui-mono text-[11px] text-text-muted tabular-nums">
                {linkedFiltered.length}/{linked.length}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="text-ui-mono mt-2 w-full rounded-xl border border-border/70 px-3 py-2.5 text-sm text-accent hover:border-accent/40"
            onClick={() => setPickerOpen(true)}
          >
            从「我的库」选择…
          </button>
          {linked.length > 0 ? (
            <label className="text-ui-mono mt-2 block">
              <span className="sr-only">搜索已引用素材</span>
              <span className="relative block">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
                  aria-hidden
                />
                <input
                  type="search"
                  value={linkedQuery}
                  onChange={(e) => setLinkedQuery(e.target.value)}
                  placeholder="搜索名称或描述…"
                  autoComplete="off"
                  className="text-ui-mono w-full rounded-lg border border-border/60 bg-surface/40 py-2 pl-8 pr-2 text-xs text-text-primary outline-none placeholder:text-text-muted/60 focus:border-accent/40"
                />
              </span>
            </label>
          ) : null}
          <div className="gd-scrollbar mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
            {linked.length === 0 ? (
              <p className="py-2 text-center text-sm text-text-muted">暂无引用</p>
            ) : linkedFiltered.length === 0 ? (
              <p className="py-2 text-center text-sm text-text-muted">没有匹配的素材</p>
            ) : (
              linkedFiltered.map((a) => {
                const ch = linkedThumbLabel(a.name);
                return (
                  <div
                    key={a.id}
                    className="flex items-stretch gap-1 rounded-xl border border-border/50 bg-surface/30 p-1.5 text-sm"
                  >
                    <Link
                      href={`/library/assets/${encodeURIComponent(a.id)}`}
                      className="flex min-w-0 flex-1 gap-2 rounded-lg outline-none ring-accent/0 transition hover:bg-white/[0.04] focus-visible:ring-2"
                      title="在「我的库」中查看"
                    >
                      {a.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed thumbnail URL
                        <img
                          src={a.coverImageUrl}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent/15 text-sm font-medium text-accent"
                          aria-hidden
                        >
                          {ch}
                        </span>
                      )}
                      <div className="min-w-0 flex-1 py-0.5">
                        <p className="font-display line-clamp-2 text-[13px] leading-snug text-text-primary">
                          {a.name}
                        </p>
                        {a.description.trim() ? (
                          <p className="text-ui-mono mt-0.5 line-clamp-2 text-[11px] leading-snug text-text-muted">
                            {a.description}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                    <button
                      type="button"
                      disabled={linkBusy}
                      title="从项目移除"
                      aria-label={`从项目移除「${a.name}」`}
                      className="text-ui-mono flex shrink-0 items-center justify-center self-center rounded-lg px-1.5 py-2 text-text-muted hover:bg-error-dim/10 hover:text-error-dim disabled:opacity-40"
                      onClick={async () => {
                        setLinkBusy(true);
                        try {
                          await unlinkProjectAsset(projectId, a.id);
                          void qc.invalidateQueries({ queryKey: ["project", projectId] });
                        } finally {
                          setLinkBusy(false);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <LinkProjectAssetsDialog
        projectId={projectId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        linkedAssets={linked}
      />
    </div>
  );
}
