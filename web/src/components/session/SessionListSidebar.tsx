"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, ChevronRight, MoreVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  listSessions,
  listSessionStagingGroups,
  createSessionStagingGroup,
  deleteSession,
  deleteSessionStagingGroup,
  patchSession,
  patchSessionStagingGroup,
} from "@/lib/api";
import type { SessionStagingGroup, SessionSummary, StagingGroupDraft } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  sessionSidebarNavListClass,
  sessionSidebarNewSessionLinkClass,
  sessionSidebarSessionLinkClass,
  sessionSidebarSessionOverflowWrapClass,
  sessionSidebarSessionRowShellClass,
} from "@/components/session/sessionSidebarNavStyles";
import {
  readLibraryPinnedSessionIds,
  sortSessionsByPinnedOrder,
  togglePinnedId,
  writeLibraryPinnedSessionIds,
} from "@/components/session/sessionSidebarPinned";

type InlineRename =
  | { kind: "group"; id: string; value: string }
  | { kind: "session"; id: string; value: string };

export function SessionListSidebar({ initialSessionList = [] }: { initialSessionList?: SessionSummary[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: sessionRows = initialSessionList } = useQuery({
    queryKey: ["sessions"],
    queryFn: listSessions,
    initialData: initialSessionList,
  });
  const { data: groupRows = [] } = useQuery({
    queryKey: ["session-staging-groups"],
    queryFn: listSessionStagingGroups,
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<{
    id: string;
    title: string;
    draftCount: number;
  } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [inlineRename, setInlineRename] = useState<InlineRename | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [newGroupMenuOpen, setNewGroupMenuOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupMode, setNewGroupMode] = useState<StagingGroupDraft>("independent");
  const [createGroupBusy, setCreateGroupBusy] = useState(false);
  const [pinnedSessionIds, setPinnedSessionIds] = useState<string[]>([]);

  const isNew = pathname === "/library/sessions/new";
  const isArchive = pathname.startsWith("/library/sessions/archive");
  const norm = pathname.replace(/\/$/, "");
  const groupPageMatch = /^\/library\/sessions\/groups\/([^/]+)$/.exec(norm);
  const activeGroupPageId = groupPageMatch?.[1] ?? null;
  const isGroupPage = activeGroupPageId !== null;
  const seg = norm.split("/").pop() ?? "";
  const activeSessionId =
    !isNew &&
    !isArchive &&
    !isGroupPage &&
    seg &&
    seg !== "sessions" &&
    seg !== "groups"
      ? seg
      : null;

  const ungrouped = sessionRows.filter((s) => !s.stagingGroup?.id);
  const inGroup = (gid: string) => sessionRows.filter((s) => s.stagingGroup?.id === gid);

  useEffect(() => {
    setPinnedSessionIds(readLibraryPinnedSessionIds());
  }, []);

  const sortedUngrouped = useMemo(
    () => sortSessionsByPinnedOrder(ungrouped, pinnedSessionIds),
    [ungrouped, pinnedSessionIds]
  );

  const persistLibraryPins = (next: string[]) => {
    setPinnedSessionIds(next);
    writeLibraryPinnedSessionIds(next);
  };

  useEffect(() => {
    if (!activeSessionId) return;
    const row = sessionRows.find((s) => s.id === activeSessionId);
    const gid = row?.stagingGroup?.id;
    if (gid) {
      setExpandedGroups((prev) => (prev[gid] ? prev : { ...prev, [gid]: true }));
    }
  }, [activeSessionId, sessionRows]);

  useEffect(() => {
    if (!activeGroupPageId) return;
    setExpandedGroups((prev) =>
      prev[activeGroupPageId] ? prev : { ...prev, [activeGroupPageId]: true }
    );
  }, [activeGroupPageId]);

  const toggleGroupExpanded = (gid: string) => {
    setExpandedGroups((prev) => ({ ...prev, [gid]: !prev[gid] }));
  };

  const cancelInlineRename = () => setInlineRename(null);

  const commitGroupRename = async () => {
    if (!inlineRename || inlineRename.kind !== "group") return;
    const v = inlineRename.value.trim();
    if (!v || renameBusy) return;
    setRenameBusy(true);
    try {
      await patchSessionStagingGroup(inlineRename.id, { name: v });
      setInlineRename(null);
      void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      void qc.invalidateQueries({ queryKey: ["session-staging-group-drafts"] });
    } catch {
      // ignore
    } finally {
      setRenameBusy(false);
    }
  };

  const commitSessionRename = async () => {
    if (!inlineRename || inlineRename.kind !== "session") return;
    const v = inlineRename.value.trim();
    if (!v || renameBusy) return;
    setRenameBusy(true);
    try {
      await patchSession(inlineRename.id, { title: v });
      const sid = inlineRename.id;
      setInlineRename(null);
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      void qc.invalidateQueries({ queryKey: ["session", sid] });
    } catch {
      // ignore
    } finally {
      setRenameBusy(false);
    }
  };

  const onRenameKeyDown = (e: KeyboardEvent, kind: InlineRename["kind"]) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelInlineRename();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void (kind === "group" ? commitGroupRename() : commitSessionRename());
    }
  };

  const iconBtn =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-white/5 hover:text-text-primary disabled:opacity-40";

  /** Group header row: pencil/delete when group page selected, hover, or focus-within. */
  const rowActionsClass = (active: boolean) =>
    cn(
      "flex shrink-0 items-center gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
      active && "opacity-100"
    );

  const sessionOverflowMenuClass =
    "text-ui-mono z-[200] min-w-[9.5rem] rounded-md border border-border bg-bg-base p-1 shadow-lg";

  const renderSessionRow = (s: SessionSummary) => {
    const sessionEdit =
      inlineRename?.kind === "session" && inlineRename.id === s.id ? inlineRename : null;
    const editing = !!sessionEdit;
    const rowActive = activeSessionId === s.id;
    const isPinned = pinnedSessionIds.includes(s.id);
    return (
      <li key={s.id}>
        <div
          className={cn(
            "group flex min-w-0 items-center",
            editing ? "gap-1" : "gap-0",
            !editing && sessionSidebarSessionRowShellClass(rowActive)
          )}
        >
          {editing ? (
            <input
              autoFocus
              disabled={renameBusy}
              className="text-ui-mono min-w-0 flex-1 rounded-xl border border-accent/40 bg-surface/60 px-3 py-2 text-[15px] text-text-primary outline-none focus:border-accent"
              value={sessionEdit.value}
              maxLength={200}
              aria-label="会话名称"
              onChange={(e) =>
                setInlineRename({ kind: "session", id: s.id, value: e.target.value })
              }
              onKeyDown={(e) => onRenameKeyDown(e, "session")}
            />
          ) : (
            <Link
              href={`/library/sessions/${s.id}`}
              title={s.title}
              className={sessionSidebarSessionLinkClass(rowActive)}
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
                disabled={renameBusy || !sessionEdit.value.trim()}
                onClick={() => void commitSessionRename()}
              >
                <Check className="h-4 w-4 text-accent" aria-hidden />
              </button>
              <button
                type="button"
                className={iconBtn}
                title="取消"
                aria-label="取消"
                disabled={renameBusy}
                onClick={cancelInlineRename}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </>
          ) : (
            <span className={sessionSidebarSessionOverflowWrapClass(rowActive)}>
              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className={cn(iconBtn, "text-text-muted/80 hover:text-text-primary")}
                    aria-label={`「${s.title}」更多操作`}
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
                      onSelect={() => persistLibraryPins(togglePinnedId(pinnedSessionIds, s.id))}
                    >
                      {isPinned ? "取消固定" : "固定"}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="cursor-pointer rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-white/5"
                      onSelect={() => setInlineRename({ kind: "session", id: s.id, value: s.title })}
                    >
                      重命名
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="cursor-pointer rounded px-2 py-1.5 text-sm text-error-dim outline-none data-[highlighted]:bg-white/5"
                      onSelect={() =>
                        setSessionToDelete({
                          id: s.id,
                          title: s.title,
                          draftCount: s.draftAssetCount,
                        })
                      }
                    >
                      删除
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </span>
          )}
        </div>
      </li>
    );
  };

  const renderGroupRow = (g: SessionStagingGroup, sessions: SessionSummary[], groupRowActive: boolean) => {
    const open = !!expandedGroups[g.id];
    const groupEdit =
      inlineRename?.kind === "group" && inlineRename.id === g.id ? inlineRename : null;
    const editing = !!groupEdit;
    const groupPageSelected = activeGroupPageId === g.id;
    return (
      <li key={g.id}>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-xl px-1 py-1.5",
            groupRowActive && "bg-accent/[0.06] ring-1 ring-inset ring-accent/12"
          )}
        >
          <button
            type="button"
            className={cn(iconBtn, "shrink-0")}
            aria-expanded={open}
            aria-label={open ? "收起分组内会话" : "展开分组内会话"}
            onClick={() => toggleGroupExpanded(g.id)}
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                autoFocus
                disabled={renameBusy}
                className="text-ui-mono w-full rounded border border-accent/40 bg-surface/60 px-1.5 py-1 text-xs font-medium text-text-primary outline-none focus:border-accent"
                value={groupEdit.value}
                maxLength={120}
                aria-label="分组名称"
                onChange={(e) =>
                  setInlineRename({ kind: "group", id: g.id, value: e.target.value })
                }
                onKeyDown={(e) => onRenameKeyDown(e, "group")}
              />
            ) : (
              <Link
                href={`/library/sessions/groups/${encodeURIComponent(g.id)}`}
                className="block min-w-0 rounded-lg px-1 py-0.5 hover:bg-white/[0.04]"
                title="分组设置与组内会话"
              >
                <p className="truncate text-sm font-medium text-text-primary/95">{g.name}</p>
                <p className="text-xs text-text-muted/85">
                  {g.draftStaging === "shared" ? "共享暂存" : "各会话独立暂存"} · {sessions.length}{" "}
                  个会话
                </p>
              </Link>
            )}
          </div>
          {editing ? (
            <>
              <button
                type="button"
                className={iconBtn}
                title="保存"
                aria-label="保存分组名称"
                disabled={renameBusy || !groupEdit.value.trim()}
                onClick={() => void commitGroupRename()}
              >
                <Check className="h-3.5 w-3.5 text-accent" aria-hidden />
              </button>
              <button
                type="button"
                className={iconBtn}
                title="取消"
                aria-label="取消"
                disabled={renameBusy}
                onClick={cancelInlineRename}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </>
          ) : (
            <span className={rowActionsClass(groupPageSelected)}>
              <button
                type="button"
                className={iconBtn}
                title="重命名"
                aria-label={`重命名分组「${g.name}」`}
                onClick={(e) => {
                  e.preventDefault();
                  setInlineRename({ kind: "group", id: g.id, value: g.name });
                }}
              >
                <Pencil className="h-3 w-3 opacity-80" aria-hidden />
              </button>
              <button
                type="button"
                className={cn(iconBtn, "hover:text-error-dim")}
                title="删除分组"
                aria-label="删除分组"
                onClick={() => setDeleteId(g.id)}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
        {open && (
          <ul
            className={cn(
              "mb-1 ml-3 border-l border-border/50 py-1 pl-3",
              sessionSidebarNavListClass
            )}
          >
            {sessions.length === 0 && (
              <li className="py-1 text-sm text-text-muted/70">（暂无会话）</li>
            )}
            {sortSessionsByPinnedOrder(sessions, pinnedSessionIds).map((s) => renderSessionRow(s))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <aside className="gd-scrollbar box-border flex h-full min-h-0 w-full min-w-0 shrink-0 flex-col overflow-y-auto p-4">
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="删除此分组？"
        description="将解除会话与该分组的关联；不会删除聊天记录。组内若存在共享/独立暂存条目，需先清空后再删。"
        confirmLabel="删除"
        tone="danger"
        pendingLabel="删除中…"
        onConfirm={async () => {
          if (!deleteId) return;
          await deleteSessionStagingGroup(deleteId);
          setDeleteId(null);
          void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
          void qc.invalidateQueries({ queryKey: ["sessions"] });
        }}
      />
      <ConfirmDialog
        open={!!sessionToDelete}
        onOpenChange={(o) => !o && setSessionToDelete(null)}
        title="删除此会话？"
        description={
          sessionToDelete
            ? `「${sessionToDelete.title}」及其聊天记录将被永久删除。尚未导出到「我的库」、且归属本会话的暂存（当前列表显示 ${sessionToDelete.draftCount} 条）会一并删除；已入库素材不受影响。组内「共享暂存」的整池不会因删除单条会话而清空。此操作不可撤销。`
            : ""
        }
        confirmLabel="删除"
        tone="danger"
        pendingLabel="删除中…"
        onConfirm={async () => {
          if (!sessionToDelete) return;
          const sid = sessionToDelete.id;
          await deleteSession(sid);
          setSessionToDelete(null);
          if (pinnedSessionIds.includes(sid)) {
            persistLibraryPins(pinnedSessionIds.filter((id) => id !== sid));
          }
          void qc.invalidateQueries({ queryKey: ["sessions"] });
          void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
          void qc.invalidateQueries({ queryKey: ["session-staging-group-drafts"] });
          void qc.removeQueries({ queryKey: ["session", sid] });
          if (activeSessionId === sid) {
            router.push("/library/sessions");
          }
        }}
      />
      <p className="text-sm font-semibold text-text-muted">会话</p>
      <p className="mt-1 text-xs leading-snug text-text-muted/80">
        未加入分组的会话列于此
      </p>
      <ul
        className={cn(
          "gd-scrollbar mt-2 max-h-[min(42vh,22rem)] overflow-y-auto text-text-primary",
          sessionSidebarNavListClass
        )}
      >
        <li>
          <Link
            href="/library/sessions/new"
            className={cn("font-display", sessionSidebarNewSessionLinkClass(isNew))}
          >
            <Plus className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            新会话
          </Link>
        </li>
        {sortedUngrouped.map((s) => renderSessionRow(s))}
        {ungrouped.length === 0 && (
          <li className="px-3 py-2 text-sm text-text-muted/75">（暂无未分组会话）</li>
        )}
      </ul>

      <div className="mt-5 flex items-center justify-between gap-1 pr-0.5">
        <p className="text-sm font-semibold text-text-muted">分组</p>
        <DropdownMenu.Root modal={false} open={newGroupMenuOpen} onOpenChange={setNewGroupMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className={iconBtn}
              title="新建分组"
              aria-label="新建分组"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="text-ui-mono z-[90] w-[min(calc(100vw-2rem),17rem)] rounded-md border border-border bg-bg-base p-2 shadow-lg"
              sideOffset={6}
              align="end"
            >
              <p className="px-0.5 text-xs text-text-muted">名称与暂存模式</p>
              <input
                className="mt-1 w-full rounded border border-border/60 bg-surface/40 px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
                placeholder="分组名称"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
              <div
                className="mt-2 flex rounded border border-border/60 bg-surface/30 p-0.5"
                role="radiogroup"
                aria-label="新建分组的暂存模式"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={newGroupMode === "independent"}
                  className={cn(
                    "text-ui-mono flex-1 rounded px-1.5 py-1 text-left text-xs outline-none transition-colors",
                    newGroupMode === "independent"
                      ? "bg-accent/15 text-accent"
                      : "text-text-muted hover:text-text-primary"
                  )}
                  onClick={() => setNewGroupMode("independent")}
                >
                  各会话独立暂存
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={newGroupMode === "shared"}
                  className={cn(
                    "text-ui-mono flex-1 rounded px-1.5 py-1 text-left text-xs outline-none transition-colors",
                    newGroupMode === "shared"
                      ? "bg-accent/15 text-accent"
                      : "text-text-muted hover:text-text-primary"
                  )}
                  onClick={() => setNewGroupMode("shared")}
                >
                  组内共享暂存
                </button>
              </div>
              <button
                type="button"
                className="text-ui-mono mt-2 w-full rounded bg-accent/10 py-1 text-xs text-accent disabled:opacity-40"
                disabled={createGroupBusy || !newGroupName.trim()}
                onClick={async () => {
                  setCreateGroupBusy(true);
                  try {
                    await createSessionStagingGroup(newGroupName.trim(), newGroupMode);
                    setNewGroupName("");
                    setNewGroupMode("independent");
                    setNewGroupMenuOpen(false);
                    void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
                  } catch {
                    // ignore
                  } finally {
                    setCreateGroupBusy(false);
                  }
                }}
              >
                {createGroupBusy ? "创建中…" : "创建"}
              </button>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <ul className={cn("mt-2 text-text-primary", sessionSidebarNavListClass)}>
        {groupRows.map((g) => {
          const sessions = inGroup(g.id);
          const groupRowActive =
            activeGroupPageId === g.id ||
            (!!activeSessionId && sessions.some((s) => s.id === activeSessionId));
          return renderGroupRow(g, sessions, groupRowActive);
        })}
        {groupRows.length === 0 && (
          <li className="px-1 py-2 text-sm text-text-muted/80">暂无分组，点击右侧 + 创建。</li>
        )}
      </ul>

    </aside>
  );
}
