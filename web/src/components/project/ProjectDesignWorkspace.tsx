"use client";

import { useQuery } from "@tanstack/react-query";
import { getProject, getSession } from "@/lib/api";
import type { SessionDetail } from "@/lib/types";
import { ChatThreadPanel } from "@/components/session/ChatThreadPanel";
import { ProjectDesignSidebar } from "@/components/project/ProjectDesignSidebar";
import { ProjectGddEditor } from "@/components/project/ProjectGddEditor";
import { WorkspaceHorizontalSplit } from "@/components/shell/WorkspaceHorizontalSplit";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function ProjectDesignWorkspace({
  projectId,
  sessionId,
  initialSession,
}: {
  projectId: string;
  sessionId: string;
  initialSession: SessionDetail;
}) {
  const [streaming, setStreaming] = useState(false);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
  });

  const { data: session = initialSession, refetch: refetchSession } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => getSession(sessionId) as Promise<SessionDetail | null>,
    initialData: initialSession,
    initialDataUpdatedAt: 0,
    staleTime: 0,
    refetchOnMount: "always",
  });

  if (!session) {
    return <p className="p-6 text-text-muted">未找到会话</p>;
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <WorkspaceHorizontalSplit
        storageKey={`layout:project-design-${projectId}`}
        leftDefaultSize={24}
        leftMinSize={18}
        rightMinSize={45}
        className="h-full min-h-0 flex-1"
        leftClassName="min-h-0 min-w-0 overflow-hidden"
        rightClassName="min-h-0 min-w-0"
        left={<ProjectDesignSidebar projectId={projectId} sessionId={sessionId} streaming={streaming} />}
        right={
          <WorkspaceHorizontalSplit
            storageKey={`layout:project-design-chat-gdd-${projectId}`}
            leftDefaultSize={52}
            leftMinSize={32}
            rightMinSize={22}
            className="h-full min-h-0"
            leftClassName="min-h-0 min-w-0"
            rightClassName="min-h-0 min-w-0 overflow-hidden"
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
              project ? (
                <ProjectGddEditor
                  key={projectId}
                  projectId={projectId}
                  initialMarkdown={project.designDocument ?? ""}
                />
              ) : (
                <div className="flex h-full min-h-0 flex-col items-center justify-center border-l border-border/60 bg-bg-base/40 px-4 text-center text-ui-mono text-xs text-text-muted">
                  加载设计文档…
                </div>
              )
            }
          />
        }
      />
    </div>
  );
}
