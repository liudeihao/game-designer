"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, X } from "lucide-react";
import { useCallback, useState, type KeyboardEvent } from "react";
import {
  createProjectSession,
  getProject,
  listProjectSessions,
  patchSession,
  unlinkProjectAsset,
} from "@/lib/api";
import type { ProjectDetail, ProjectSessionSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LinkProjectAssetsDialog } from "@/components/project/LinkProjectAssetsDialog";

const iconBtn =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-muted hover:bg-white/5 hover:text-text-primary disabled:opacity-40";

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

  const rowActionsClass = (active: boolean) =>
    cn(
      "flex shrink-0 items-center gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
      active && "opacity-100"
    );

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

  const formatThreadMeta = useCallback((t: ProjectSessionSummary) => {
    try {
      return new Date(t.updatedAt).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-0 border-r border-border/60 bg-bg-base/50">
      <div className="shrink-0 border-b border-border/50 px-2 py-2">
        <p className="text-ui-mono px-1 text-xs font-medium uppercase tracking-wide text-text-muted">
          会话
        </p>
        <button
          type="button"
          disabled={streaming}
          className="text-ui-mono mt-1.5 w-full rounded border border-accent/35 bg-accent/10 px-2 py-1.5 text-xs text-accent hover:bg-accent/15 disabled:opacity-50"
          onClick={async () => {
            const s = await createProjectSession(projectId, {});
            void qc.invalidateQueries({ queryKey: ["project-sessions", projectId] });
            router.push(`/projects/${projectId}/design/${s.id}`);
          }}
        >
          + 新会话
        </button>
      </div>
      <div className="gd-scrollbar min-h-0 max-h-[42%] flex-shrink-0 overflow-y-auto px-1 py-1">
        <ul className="space-y-0.5">
          {threads.map((s) => {
            const active = s.id === sessionId;
            const editing = inlineRename?.id === s.id;
            return (
              <li key={s.id}>
                <div className="group flex min-w-0 items-center gap-0.5 rounded px-1 py-0.5">
                  {editing ? (
                    <input
                      autoFocus
                      disabled={renameBusy}
                      className="text-ui-mono min-w-0 flex-1 rounded border border-accent/40 bg-surface/60 px-1.5 py-1 text-xs text-text-primary outline-none focus:border-accent"
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
                      className={cn(
                        "min-w-0 flex-1 truncate rounded px-1 py-1 text-xs",
                        active
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
                        disabled={renameBusy || !inlineRename?.value.trim()}
                        onClick={() => void commitRename(s.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className={iconBtn}
                        title="取消"
                        aria-label="取消"
                        disabled={renameBusy}
                        onClick={() => setInlineRename(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <div className={rowActionsClass(active)}>
                      <button
                        type="button"
                        className={iconBtn}
                        title="重命名"
                        aria-label="重命名"
                        onClick={() => setInlineRename({ id: s.id, value: s.title })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {!editing && (
                  <p className="text-ui-mono mb-1 pl-1 text-xs text-text-muted/80">
                    {formatThreadMeta(s)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-border/50 px-2 py-2">
        <p className="text-ui-mono px-1 text-xs font-medium uppercase tracking-wide text-text-muted">
          引用素材
        </p>
        <button
          type="button"
          className="text-ui-mono mt-1.5 w-full rounded border border-border/70 px-2 py-1.5 text-xs text-accent hover:border-accent/40"
          onClick={() => setPickerOpen(true)}
        >
          从「我的库」选择…
        </button>
        <div className="gd-scrollbar mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
          {linked.length === 0 ? (
            <p className="text-ui-mono py-2 text-center text-xs text-text-muted">暂无引用</p>
          ) : (
            linked.map((a) => (
              <div
                key={a.id}
                className="rounded border border-border/50 bg-surface/30 px-2 py-1.5 text-xs"
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

      <LinkProjectAssetsDialog
        projectId={projectId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        linkedAssets={linked}
      />
    </div>
  );
}
