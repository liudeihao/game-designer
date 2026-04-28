"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, MoreVertical, X } from "lucide-react";
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
import { WorkspaceVerticalSplit } from "@/components/shell/WorkspaceVerticalSplit";
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

const sessionOverflowMenuClass =
  "text-ui-mono z-[200] min-w-[9.5rem] rounded-md border border-border bg-bg-base p-1 shadow-lg";

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
  const linked = (project as ProjectDetail | null | undefined)?.linkedAssets ?? [];

  const [pickerOpen, setPickerOpen] = useState(false);
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

      <div className="shrink-0 border-b border-border/50 px-3 py-3">
        <p className="text-sm font-semibold text-text-muted">会话</p>
        <button
          type="button"
          disabled={streaming}
          className="font-display mt-2 w-full rounded-xl border border-accent/35 bg-accent/10 px-3 py-2.5 text-sm text-accent hover:bg-accent/15 disabled:opacity-50"
          onClick={async () => {
            const s = await createProjectSession(projectId, {});
            void qc.invalidateQueries({ queryKey: ["project-sessions", projectId] });
            router.push(`/projects/${projectId}/design/${s.id}`);
          }}
        >
          + 新会话
        </button>
      </div>

      <WorkspaceVerticalSplit
        storageKey={`layout:project-design-sidebar-sessions-assets-${projectId}`}
        topDefaultSize={46}
        bottomDefaultSize={54}
        topMinSize={18}
        bottomMinSize={20}
        separatorAriaLabel="拖动调整会话列表与引用素材区高度"
        separatorTitle="拖动调整会话列表与引用素材区比例"
        className="min-h-0 flex-1"
        topClassName="min-h-0 min-w-0"
        bottomClassName="min-h-0 min-w-0"
        top={
          <div className="gd-scrollbar h-full min-h-0 overflow-y-auto px-2 py-2">
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
        }
        bottom={
          <div className="flex h-full min-h-0 flex-col px-3 py-3">
            <p className="text-sm font-semibold text-text-muted">引用素材</p>
            <button
              type="button"
              className="text-ui-mono mt-2 w-full rounded-xl border border-border/70 px-3 py-2.5 text-sm text-accent hover:border-accent/40"
              onClick={() => setPickerOpen(true)}
            >
              从「我的库」选择…
            </button>
            <div className="gd-scrollbar mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
              {linked.length === 0 ? (
                <p className="py-2 text-center text-sm text-text-muted">暂无引用</p>
              ) : (
                linked.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-xl border border-border/50 bg-surface/30 px-3 py-2 text-sm"
                  >
                    <p className="font-display line-clamp-2 text-text-primary">{a.name}</p>
                    <button
                      type="button"
                      disabled={linkBusy}
                      className="text-ui-mono mt-1 text-xs text-text-muted hover:text-error-dim"
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
                      移除
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        }
      />

      <LinkProjectAssetsDialog
        projectId={projectId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        linkedAssets={linked}
      />
    </div>
  );
}
