"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import {
  listSessions,
  listSessionStagingGroups,
  createSessionStagingGroup,
  deleteSessionStagingGroup,
  patchSession,
  patchSessionStagingGroup,
} from "@/lib/api";
import type { SessionStagingGroup, SessionSummary, StagingGroupDraft } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type InlineRename =
  | { kind: "group"; id: string; value: string }
  | { kind: "session"; id: string; value: string };

export function SessionListSidebar({ initialSessionList = [] }: { initialSessionList?: SessionSummary[] }) {
  const pathname = usePathname();
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

  const [newName, setNewName] = useState("");
  const [newMode, setNewMode] = useState<StagingGroupDraft>("independent");
  const [createBusy, setCreateBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [inlineRename, setInlineRename] = useState<InlineRename | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);

  const isIndex = pathname === "/library/sessions" || pathname === "/library/sessions/";
  const isNew = pathname === "/library/sessions/new";
  const isArchive = pathname.startsWith("/library/sessions/archive");
  const seg = pathname.replace(/\/$/, "").split("/").pop() ?? "";
  const activeSessionId =
    !isIndex && !isNew && !isArchive && seg && seg !== "sessions" ? seg : null;

  const ungrouped = sessionRows.filter((s) => !s.stagingGroup?.id);
  const inGroup = (gid: string) => sessionRows.filter((s) => s.stagingGroup?.id === gid);

  useEffect(() => {
    if (!activeSessionId) return;
    const row = sessionRows.find((s) => s.id === activeSessionId);
    const gid = row?.stagingGroup?.id;
    if (gid) {
      setExpandedGroups((prev) => (prev[gid] ? prev : { ...prev, [gid]: true }));
    }
  }, [activeSessionId, sessionRows]);

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
    "flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-muted hover:bg-white/5 hover:text-text-primary disabled:opacity-40";

  const renderSessionRow = (s: SessionSummary, compact: boolean) => {
    const sessionEdit =
      inlineRename?.kind === "session" && inlineRename.id === s.id ? inlineRename : null;
    const editing = !!sessionEdit;
    return (
      <li key={s.id}>
        <div
          className={cn(
            "flex min-w-0 items-center gap-0.5 rounded",
            compact ? "py-0.5 pl-0.5 pr-0" : "px-1 py-0.5"
          )}
        >
          {editing ? (
            <input
              autoFocus
              disabled={renameBusy}
              className="text-ui-mono min-w-0 flex-1 rounded border border-accent/40 bg-surface/60 px-1.5 py-1 text-[12px] text-text-primary outline-none focus:border-accent"
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
              className={cn(
                "min-w-0 flex-1 truncate rounded px-1 py-1",
                compact ? "pl-0.5" : "",
                activeSessionId === s.id
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:text-text-primary"
              )}
            >
              {s.title}
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
            <button
              type="button"
              className={iconBtn}
              title="重命名"
              aria-label={`重命名「${s.title}」`}
              onClick={(e) => {
                e.preventDefault();
                setInlineRename({ kind: "session", id: s.id, value: s.title });
              }}
            >
              <Pencil className="h-3 w-3 opacity-80" aria-hidden />
            </button>
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
    return (
      <li key={g.id}>
        <div
          className={cn(
            "flex items-center gap-0.5 rounded px-1 py-1",
            groupRowActive && "bg-accent/[0.07]"
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
                className="text-ui-mono w-full rounded border border-accent/40 bg-surface/60 px-1.5 py-1 text-[12px] font-medium text-text-primary outline-none focus:border-accent"
                value={groupEdit.value}
                maxLength={120}
                aria-label="分组名称"
                onChange={(e) =>
                  setInlineRename({ kind: "group", id: g.id, value: e.target.value })
                }
                onKeyDown={(e) => onRenameKeyDown(e, "group")}
              />
            ) : (
              <>
                <p className="truncate text-[12px] font-medium text-text-primary/95" title={g.name}>
                  {g.name}
                </p>
                <p className="text-[9px] text-text-muted/85">
                  {g.draftStaging === "shared" ? "共享暂存" : "各会话独立暂存"} · {sessions.length}{" "}
                  个会话
                </p>
              </>
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
            <>
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
            </>
          )}
        </div>
        {open && (
          <ul className="mb-1 ml-4 space-y-0.5 border-l border-border/50 py-0.5 pl-2 text-[12px]">
            {sessions.length === 0 && (
              <li className="py-0.5 text-[10px] text-text-muted/70">（暂无会话）</li>
            )}
            {sessions.map((s) => renderSessionRow(s, true))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <aside className="gd-scrollbar box-border flex h-full min-h-0 w-full min-w-0 shrink-0 flex-col overflow-y-auto border-r border-divider p-4">
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
      <p className="text-ui-mono text-[11px] uppercase tracking-wider text-text-muted">会话</p>
      <ul className="mt-1 space-y-0.5 text-ui-mono text-[13px] text-text-primary">
        <li>
          <Link
            href="/library/sessions"
            className={cn(
              "block rounded px-2 py-1.5",
              isIndex ? "bg-accent/10 text-accent" : "text-text-muted hover:text-text-primary"
            )}
          >
            全部
          </Link>
        </li>
        <li>
          <Link
            href="/library/sessions/new"
            className={cn(
              "inline-flex w-full items-center gap-1 rounded px-2 py-1.5",
              isNew ? "bg-accent/10 text-accent" : "text-accent hover:bg-accent/10"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            新会话
          </Link>
        </li>
      </ul>

      <p className="text-ui-mono mt-4 text-[10px] uppercase tracking-wider text-text-muted">分组</p>
      <ul className="mt-1 space-y-0.5 text-ui-mono text-[12px] text-text-primary">
        {groupRows.map((g) => {
          const sessions = inGroup(g.id);
          const groupRowActive =
            !!activeSessionId && sessions.some((s) => s.id === activeSessionId);
          return renderGroupRow(g, sessions, groupRowActive);
        })}
        {groupRows.length === 0 && (
          <li className="px-1 py-1 text-[10px] text-text-muted/80">暂无分组，可在下方创建。</li>
        )}
      </ul>

      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="text-ui-mono mt-2 flex w-full items-center justify-between gap-2 rounded border border-border/60 bg-surface/30 px-2 py-1.5 text-left text-[11px] text-text-muted hover:border-accent/25 hover:text-text-primary"
          >
            管理分组
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="text-ui-mono z-[80] w-[min(calc(100vw-2rem),17rem)] rounded-md border border-border bg-bg-base p-2 shadow-lg"
            sideOffset={6}
            align="start"
          >
            <p className="px-0.5 text-[10px] text-text-muted">新建分组</p>
            <input
              className="mt-1 w-full rounded border border-border/60 bg-surface/40 px-2 py-1 text-[11px] text-text-primary outline-none focus:border-accent"
              placeholder="名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <div
              className="mt-2 flex rounded border border-border/60 bg-surface/30 p-0.5"
              role="radiogroup"
              aria-label="新建分组的暂存模式"
            >
              <button
                type="button"
                role="radio"
                aria-checked={newMode === "independent"}
                className={cn(
                  "text-ui-mono flex-1 rounded px-1.5 py-1 text-left text-[10px] outline-none transition-colors",
                  newMode === "independent"
                    ? "bg-accent/15 text-accent"
                    : "text-text-muted hover:text-text-primary"
                )}
                onClick={() => setNewMode("independent")}
              >
                各会话独立暂存
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={newMode === "shared"}
                className={cn(
                  "text-ui-mono flex-1 rounded px-1.5 py-1 text-left text-[10px] outline-none transition-colors",
                  newMode === "shared"
                    ? "bg-accent/15 text-accent"
                    : "text-text-muted hover:text-text-primary"
                )}
                onClick={() => setNewMode("shared")}
              >
                组内共享暂存
              </button>
            </div>
            <button
              type="button"
              className="text-ui-mono mt-2 w-full rounded bg-accent/10 py-1 text-[11px] text-accent disabled:opacity-40"
              disabled={createBusy || !newName.trim()}
              onClick={async () => {
                setCreateBusy(true);
                try {
                  await createSessionStagingGroup(newName.trim(), newMode);
                  setNewName("");
                  setNewMode("independent");
                  void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
                } catch {
                  // ignore
                } finally {
                  setCreateBusy(false);
                }
              }}
            >
              {createBusy ? "创建中…" : "创建"}
            </button>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {ungrouped.length > 0 && (
        <>
          <p className="text-ui-mono mt-4 text-[10px] uppercase tracking-wider text-text-muted">未分组</p>
          <ul className="gd-scrollbar mt-1 max-h-40 space-y-0.5 overflow-y-auto text-ui-mono text-[13px]">
            {ungrouped.map((s) => renderSessionRow(s, false))}
          </ul>
        </>
      )}

    </aside>
  );
}
