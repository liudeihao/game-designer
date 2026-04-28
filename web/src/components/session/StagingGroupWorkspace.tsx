"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  deleteSessionStagingGroup,
  listSessions,
  listSessionStagingGroups,
  patchSessionStagingGroup,
} from "@/lib/api";
import type { StagingGroupDraft } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { WorkspaceHorizontalSplit } from "@/components/shell/WorkspaceHorizontalSplit";
import { GroupStagingDraftsPanel } from "@/components/session/GroupStagingDraftsPanel";

export function StagingGroupWorkspace({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ["session-staging-groups"],
    queryFn: listSessionStagingGroups,
  });
  const { data: sessionRows = [] } = useQuery({
    queryKey: ["sessions"],
    queryFn: listSessions,
  });

  const group = useMemo(() => groups.find((g) => g.id === groupId) ?? null, [groups, groupId]);

  const members = useMemo(
    () => sessionRows.filter((s) => s.stagingGroup?.id === groupId),
    [sessionRows, groupId]
  );

  const [groupNameField, setGroupNameField] = useState("");
  const [groupSettingsBusy, setGroupSettingsBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (group) setGroupNameField(group.name);
  }, [group?.id, group?.name]);

  const panelDraftMode: StagingGroupDraft = group?.draftStaging ?? "independent";

  if (!groupsLoading && !group) {
    return (
      <div className="p-6">
        <p className="text-ui-mono text-text-muted">未找到该分组，可能已被删除。</p>
        <Link
          href="/library/sessions"
          className="text-ui-mono mt-3 inline-block text-sm text-accent hover:underline"
        >
          返回会话列表
        </Link>
      </div>
    );
  }

  if (!group) {
    return <p className="p-6 text-ui-mono text-text-muted">加载中…</p>;
  }

  const draftsPanel = (
    <GroupStagingDraftsPanel
      groupId={groupId}
      group={group}
      members={members}
      layout="split"
    />
  );
  const draftsPanelStacked = (
    <GroupStagingDraftsPanel
      groupId={groupId}
      group={group}
      members={members}
      layout="stacked"
    />
  );

  const leftColumn = (
    <div className="mx-auto w-full max-w-xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-ui-mono text-xs uppercase tracking-wide text-text-muted">会话分组</p>
            <h1 className="font-display mt-1 text-2xl text-text-primary">{group.name}</h1>
            <p className="text-ui-mono mt-1 text-xs text-text-muted/85">
              {group.draftStaging === "shared" ? "组内共享暂存" : "各会话独立暂存"} · {members.length}{" "}
              个会话
            </p>
          </div>
          <button
            type="button"
            className="text-ui-mono rounded border border-border/60 px-2.5 py-1 text-xs text-error-dim/90 hover:border-error-dim/40 hover:bg-error-dim/5"
            disabled={groupSettingsBusy}
            onClick={() => setDeleteOpen(true)}
          >
            删除分组
          </button>
        </div>

        <div className="mt-8 space-y-6 border-t border-divider pt-6">
          <section>
            <p className="text-ui-mono text-xs uppercase tracking-wide text-text-muted">分组名称</p>
            <div className="mt-1 flex flex-wrap items-stretch gap-2">
              <input
                className="text-ui-mono min-w-[10rem] flex-1 rounded border border-border/60 bg-surface/50 px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50"
                value={groupNameField}
                onChange={(e) => setGroupNameField(e.target.value)}
                maxLength={120}
                disabled={groupSettingsBusy}
              />
              <button
                type="button"
                className="text-ui-mono shrink-0 rounded bg-accent/15 px-3 py-1.5 text-xs text-accent hover:bg-accent/25 disabled:opacity-40"
                disabled={
                  groupSettingsBusy ||
                  !groupNameField.trim() ||
                  groupNameField.trim() === group.name
                }
                onClick={async () => {
                  const v = groupNameField.trim();
                  if (!v) return;
                  setGroupSettingsBusy(true);
                  try {
                    await patchSessionStagingGroup(groupId, { name: v });
                    void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
                    void qc.invalidateQueries({ queryKey: ["sessions"] });
                  } catch {
                    // ignore
                  } finally {
                    setGroupSettingsBusy(false);
                  }
                }}
              >
                {groupSettingsBusy ? "保存中…" : "保存名称"}
              </button>
            </div>
          </section>

          <section>
            <p className="text-ui-mono text-xs uppercase tracking-wide text-text-muted">暂存模式</p>
            <div
              className="mt-1.5 flex rounded border border-border/60 bg-surface/30 p-0.5"
              role="radiogroup"
              aria-label="分组暂存模式"
            >
              <button
                type="button"
                role="radio"
                aria-checked={panelDraftMode === "independent"}
                className={cn(
                  "text-ui-mono flex-1 rounded px-1.5 py-1.5 text-left text-xs outline-none transition-colors disabled:opacity-40",
                  panelDraftMode === "independent"
                    ? "bg-accent/15 text-accent"
                    : "text-text-muted hover:text-text-primary"
                )}
                disabled={groupSettingsBusy}
                onClick={async () => {
                  if (panelDraftMode === "independent") return;
                  setGroupSettingsBusy(true);
                  try {
                    await patchSessionStagingGroup(groupId, { draftStaging: "independent" });
                    void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
                    void qc.invalidateQueries({ queryKey: ["sessions"] });
                    void qc.invalidateQueries({ queryKey: ["session-staging-group-drafts", groupId] });
                  } catch {
                    // ignore
                  } finally {
                    setGroupSettingsBusy(false);
                  }
                }}
              >
                各会话独立暂存
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={panelDraftMode === "shared"}
                className={cn(
                  "text-ui-mono flex-1 rounded px-1.5 py-1.5 text-left text-xs outline-none transition-colors disabled:opacity-40",
                  panelDraftMode === "shared"
                    ? "bg-accent/15 text-accent"
                    : "text-text-muted hover:text-text-primary"
                )}
                disabled={groupSettingsBusy}
                onClick={async () => {
                  if (panelDraftMode === "shared") return;
                  setGroupSettingsBusy(true);
                  try {
                    await patchSessionStagingGroup(groupId, { draftStaging: "shared" });
                    void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
                    void qc.invalidateQueries({ queryKey: ["sessions"] });
                    void qc.invalidateQueries({ queryKey: ["session-staging-group-drafts", groupId] });
                  } catch {
                    // ignore
                  } finally {
                    setGroupSettingsBusy(false);
                  }
                }}
              >
                组内共享暂存
              </button>
            </div>
            <p className="text-ui-mono mt-2 text-xs leading-relaxed text-text-muted/90">
              {panelDraftMode === "shared"
                ? "共享：全组合用一套暂存池，任一会话里增删会同步。"
                : "独立：每条暂存归属具体会话；在任一组内会话中仍可查看本组全部暂存汇总。"}
            </p>
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-ui-mono text-xs uppercase tracking-wide text-text-muted">组内会话</p>
              <Link
                href={`/library/sessions/new?group=${encodeURIComponent(groupId)}`}
                className="text-ui-mono inline-flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-2 py-1 text-xs text-accent hover:border-accent/50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                新会话（加入此分组）
              </Link>
            </div>
            <ul className="mt-2 space-y-1">
              {members.length === 0 && (
                <li className="text-ui-mono text-xs text-text-muted/80">暂无会话，可使用上方按钮新建。</li>
              )}
              {members.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/library/sessions/${s.id}`}
                    className="text-ui-mono block truncate rounded border border-border/40 bg-surface/40 px-3 py-2 text-sm text-text-primary hover:border-accent/30"
                  >
                    {s.title}
                    <span className="ml-2 text-xs text-text-muted">{s.draftAssetCount} 条暂存</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-ui-mono mt-3 text-xs leading-relaxed text-text-muted/80">
              与 AI 聊天请打开组内某一会话。分组属性与列表在此；组内全部暂存在右侧（桌面）或下方（窄屏）。
            </p>
          </section>
        </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => !o && setDeleteOpen(false)}
        title="删除此分组？"
        description="将解除会话与该分组的关联；不会删除聊天记录。组内若存在共享/独立暂存条目，需先清空后再删。"
        confirmLabel="删除"
        tone="danger"
        pendingLabel="删除中…"
        onConfirm={async () => {
          await deleteSessionStagingGroup(groupId);
          setDeleteOpen(false);
          void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
          void qc.invalidateQueries({ queryKey: ["sessions"] });
          void qc.invalidateQueries({ queryKey: ["session-staging-group-drafts"] });
          router.push("/library/sessions");
        }}
      />
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden lg:hidden">
        <div className="gd-scrollbar min-h-0 overflow-y-auto">{leftColumn}</div>
        {draftsPanelStacked}
      </div>
      <div className="hidden h-full min-h-0 min-w-0 flex-1 lg:flex">
        <WorkspaceHorizontalSplit
          storageKey="layout:staging-group-settings-drafts"
          leftDefaultSize={56}
          leftMinSize={28}
          rightMinSize={22}
          className="h-full min-h-0 min-w-0 flex-1"
          left={
            <div className="gd-scrollbar h-full min-h-0 overflow-y-auto border-divider lg:border-r">
              {leftColumn}
            </div>
          }
          right={draftsPanel}
        />
      </div>
    </div>
  );
}
