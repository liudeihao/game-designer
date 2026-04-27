"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderInput, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  listSessions,
  listSessionStagingGroups,
  createSessionStagingGroup,
  deleteSessionStagingGroup,
} from "@/lib/api";
import type { SessionSummary, StagingGroupDraft } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

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

  const isIndex = pathname === "/library/sessions" || pathname === "/library/sessions/";
  const isNew = pathname === "/library/sessions/new";
  const isArchive = pathname.startsWith("/library/sessions/archive");
  const seg = pathname.replace(/\/$/, "").split("/").pop() ?? "";
  const activeSessionId =
    !isIndex && !isNew && !isArchive && seg && seg !== "sessions" ? seg : null;

  const ungrouped = sessionRows.filter((s) => !s.stagingGroup?.id);
  const inGroup = (gid: string) => sessionRows.filter((s) => s.stagingGroup?.id === gid);

  return (
    <aside className="hidden w-56 shrink-0 border-r border-divider p-4 lg:block">
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
      <ul className="mt-1 max-h-[min(48vh,22rem)] space-y-3 overflow-y-auto [scrollbar-width:thin] pr-0.5 text-ui-mono text-[12px]">
        {groupRows.map((g) => {
          const sessions = inGroup(g.id);
          return (
            <li key={g.id} className="rounded border border-border/60 bg-surface/40 px-1.5 py-1.5">
              <div className="flex items-start justify-between gap-1 text-[10px] text-text-muted">
                <span className="mt-0.5 flex min-w-0 items-center gap-0.5">
                  <FolderInput className="h-3 w-3 shrink-0 text-accent/70" />
                  <span className="truncate font-medium text-text-primary/90" title={g.name}>
                    {g.name}
                  </span>
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-text-muted hover:text-error-dim"
                  title="删除分组"
                  onClick={() => setDeleteId(g.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <p className="text-[9px] text-text-muted/80">
                {g.draftStaging === "shared" ? "组内共享暂存" : "各会话独立暂存"}
              </p>
              <ul className="mt-1 space-y-0.5 border-t border-border/30 pt-1 text-[12px]">
                {sessions.length === 0 && (
                  <li className="px-1 py-0.5 text-[10px] text-text-muted/70">（暂无会话）</li>
                )}
                {sessions.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/library/sessions/${s.id}`}
                      title={s.title}
                      className={cn(
                        "block max-w-full truncate rounded px-1 py-0.5",
                        activeSessionId === s.id && "bg-accent/10 text-accent"
                      )}
                    >
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
        {groupRows.length === 0 && (
          <li className="px-1 text-[10px] text-text-muted/80">暂无分组，可在下方创建。</li>
        )}
      </ul>

      <div className="text-ui-mono mt-2 space-y-1 rounded border border-dashed border-border/80 p-2 text-[10px]">
        <p className="text-text-muted">新建分组</p>
        <input
          className="w-full border-b border-border/80 bg-transparent py-0.5 text-[11px] text-text-primary outline-none focus:border-accent"
          placeholder="名称"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <div className="flex flex-col gap-0.5 text-text-muted">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              name="sg-mode"
              checked={newMode === "independent"}
              onChange={() => setNewMode("independent")}
            />
            各会话独立暂存
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              name="sg-mode"
              checked={newMode === "shared"}
              onChange={() => setNewMode("shared")}
            />
            组内共享暂存
          </label>
        </div>
        <button
          type="button"
          className="mt-0.5 w-full rounded bg-accent/10 py-0.5 text-[11px] text-accent disabled:opacity-40"
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
      </div>

      {ungrouped.length > 0 && (
        <>
          <p className="text-ui-mono mt-4 text-[10px] uppercase tracking-wider text-text-muted">未分组</p>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto [scrollbar-width:thin] text-ui-mono text-[13px]">
            {ungrouped.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/library/sessions/${s.id}`}
                  title={s.title}
                  className={cn(
                    "block max-w-full truncate rounded px-2 py-1.5",
                    activeSessionId === s.id && "bg-accent/10 text-accent"
                  )}
                >
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

    </aside>
  );
}
