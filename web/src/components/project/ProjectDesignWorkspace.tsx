"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { createProjectSession, getProject, getSession, listProjectSessions, unlinkProjectAsset } from "@/lib/api";
import type { ProjectDetail, SessionDetail } from "@/lib/types";
import { ChatThreadPanel } from "@/components/session/ChatThreadPanel";
import { WorkspaceHorizontalSplit } from "@/components/shell/WorkspaceHorizontalSplit";
import { cn } from "@/lib/utils";

export function ProjectDesignWorkspace({
  projectId,
  sessionId,
  initialSession,
}: {
  projectId: string;
  sessionId: string;
  initialSession: SessionDetail;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [linkBusy, setLinkBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);

  const { data: threads = [] } = useQuery({
    queryKey: ["project-sessions", projectId],
    queryFn: () => listProjectSessions(projectId),
  });

  const { data: session = initialSession, refetch: refetchSession } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => getSession(sessionId) as Promise<SessionDetail | null>,
    initialData: initialSession,
    initialDataUpdatedAt: 0,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    initialData: undefined,
  });

  const linked = (project as ProjectDetail | undefined)?.linkedAssets ?? [];

  const afterLinkMutation = useCallback(
    async (p: Promise<ProjectDetail>) => {
      await p;
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    [qc, projectId]
  );

  if (!session) {
    return <p className="p-6 text-text-muted">未找到会话</p>;
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <WorkspaceHorizontalSplit
        storageKey={`layout:project-design-${projectId}`}
        leftDefaultSize={18}
        leftMinSize={14}
        rightMinSize={40}
        className="h-full min-h-0 flex-1"
        leftClassName="min-h-0 min-w-0 border-r border-border/60 bg-bg-base/50"
        rightClassName="min-h-0 min-w-0"
        left={
          <div className="flex h-full min-h-0 flex-col gap-2 p-2">
            <button
              type="button"
              disabled={streaming}
              className="text-ui-mono rounded border border-accent/35 bg-accent/10 px-2 py-1.5 text-[11px] text-accent hover:bg-accent/15 disabled:opacity-50"
              onClick={async () => {
                const s = await createProjectSession(projectId, {});
                void qc.invalidateQueries({ queryKey: ["project-sessions", projectId] });
                router.push(`/projects/${projectId}/design/${s.id}`);
              }}
            >
              + 新会话
            </button>
            <div className="gd-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto">
              {threads.map((t) => {
                const active = t.id === sessionId;
                return (
                  <Link
                    key={t.id}
                    href={`/projects/${projectId}/design/${t.id}`}
                    className={cn(
                      "text-ui-mono block truncate rounded border px-2 py-1.5 text-[11px]",
                      active
                        ? "border-accent/40 bg-accent/10 text-text-primary"
                        : "border-border/50 text-text-muted hover:border-accent/25 hover:text-text-primary"
                    )}
                    title={t.title}
                  >
                    {t.title}
                  </Link>
                );
              })}
            </div>
          </div>
        }
        right={
          <WorkspaceHorizontalSplit
            storageKey={`layout:project-design-chat-assets-${projectId}`}
            leftDefaultSize={72}
            leftMinSize={40}
            rightMinSize={18}
            className="h-full min-h-0"
            leftClassName="min-h-0 min-w-0"
            rightClassName="min-h-0 min-w-0 border-l border-border/60 bg-bg-base/40"
            left={
              <div
                className={cn(
                  "gd-editor-panel relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
                )}
              >
                <div className="pointer-events-none absolute inset-0 z-0">
                  <span className="gd-editor-panel__blade" aria-hidden />
                  <span className="gd-editor-panel__corners" aria-hidden />
                </div>
                <ChatThreadPanel
                  sessionId={sessionId}
                  session={session}
                  refetch={refetchSession}
                  showStagingGroupMenu={false}
                  stagingGroups={[]}
                  composerPlaceholder="与 AI 讨论玩法、叙事、体验与关卡节奏；引用素材的名称与描述会进入模型上下文。"
                  invalidateExtra={[{ queryKey: ["project-sessions", projectId] }]}
                  onStreamingChange={setStreaming}
                />
              </div>
            }
            right={
              <aside className="flex h-full min-h-0 flex-col gap-2 p-3">
                <h3 className="text-ui-mono text-[10px] uppercase tracking-wide text-text-muted">引用素材</h3>
                <p className="text-ui-mono text-[10px] leading-relaxed text-text-muted/90">
                  从「我的库」添加私有素材后，AI 可结合其名称与描述参与设计讨论。
                </p>
                <Link
                  href={`/library/assets?linkToProject=${encodeURIComponent(projectId)}`}
                  className="text-ui-mono rounded border border-border/70 px-2 py-1.5 text-center text-[11px] text-accent hover:border-accent/40"
                >
                  从我的库选择…
                </Link>
                <div className="gd-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto">
                  {linked.length === 0 ? (
                    <p className="text-ui-mono py-2 text-center text-[10px] text-text-muted">暂无引用</p>
                  ) : (
                    linked.map((a) => (
                      <div
                        key={a.id}
                        className="rounded border border-border/50 bg-surface/40 px-2 py-1.5 text-[11px]"
                      >
                        <p className="font-display line-clamp-2 text-text-primary">{a.name}</p>
                        <button
                          type="button"
                          disabled={linkBusy}
                          className="text-ui-mono mt-1 text-[10px] text-text-muted hover:text-error-dim"
                          onClick={async () => {
                            setLinkBusy(true);
                            try {
                              await afterLinkMutation(unlinkProjectAsset(projectId, a.id));
                              await refetchSession();
                            } finally {
                              setLinkBusy(false);
                            }
                          }}
                        >
                          移除引用
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </aside>
            }
          />
        }
      />
    </div>
  );
}
