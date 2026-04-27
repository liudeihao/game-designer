"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import {
  deleteSessionDraft,
  exportDraftToLibrary,
  exportDraftsToLibrary,
  listSessionStagingGroupDrafts,
  patchSessionDraft,
  postSessionDraft,
} from "@/lib/api";
import type { DraftAsset, SessionStagingGroup, SessionSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ThemeSelect } from "@/components/ui/ThemeSelect";

type ExportPrompt =
  | null
  | { kind: "one"; draft: DraftAsset }
  | { kind: "all" }
  | { kind: "batch" };

type Props = {
  groupId: string;
  group: SessionStagingGroup;
  members: SessionSummary[];
  /** `split`: right column in horizontal layout; `stacked`: mobile bottom panel */
  layout: "split" | "stacked";
};

export function GroupStagingDraftsPanel({ groupId, group, members, layout }: Props) {
  const qc = useQueryClient();
  const { data: draftList } = useQuery({
    queryKey: ["session-staging-group-drafts", groupId],
    queryFn: () => listSessionStagingGroupDrafts(groupId),
  });
  const draftAssets = draftList ?? [];

  const [anchorSessionId, setAnchorSessionId] = useState<string>(() => members[0]?.id ?? "");
  useEffect(() => {
    if (members.length === 0) {
      setAnchorSessionId("");
      return;
    }
    setAnchorSessionId((prev) => (members.some((m) => m.id === prev) ? prev : members[0]!.id));
  }, [members]);

  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftSaving, setDraftSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportPrompt, setExportPrompt] = useState<ExportPrompt>(null);

  const allDraftsSelected =
    draftAssets.length > 0 && selectedIds.length === draftAssets.length;

  useEffect(() => {
    if (draftAssets.length === 0) {
      setBulkMode(false);
      setSelectedIds([]);
    } else {
      setSelectedIds((prev) => prev.filter((tid) => draftAssets.some((d) => d.tempId === tid)));
    }
  }, [draftAssets]);

  const exitBulkMode = useCallback(() => {
    setBulkMode(false);
    setSelectedIds([]);
  }, []);

  const toggleDraftSelect = useCallback((tempId: string) => {
    setSelectedIds((prev) =>
      prev.includes(tempId) ? prev.filter((t) => t !== tempId) : [...prev, tempId]
    );
  }, []);

  const toggleSelectAllDrafts = useCallback(() => {
    if (draftAssets.length === 0) return;
    setSelectedIds((prev) =>
      prev.length === draftAssets.length ? [] : draftAssets.map((d) => d.tempId)
    );
  }, [draftAssets]);

  const apiSessionForDraft = useCallback(
    (d: DraftAsset) => d.ownerSessionId ?? anchorSessionId,
    [anchorSessionId]
  );

  const invalidateAfterDraftMutation = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["session-staging-group-drafts", groupId] });
    void qc.invalidateQueries({ queryKey: ["sessions"] });
    void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
  }, [qc, groupId]);

  const invalidateAfterExport = useCallback(() => {
    invalidateAfterDraftMutation();
    void qc.invalidateQueries({ queryKey: ["assets"] });
    void qc.invalidateQueries({ queryKey: ["session"] });
  }, [invalidateAfterDraftMutation, qc]);

  const exportDialogTitle =
    exportPrompt?.kind === "one"
      ? "导出到「我的库」？"
      : exportPrompt?.kind === "all"
        ? "导出全部暂存？"
        : exportPrompt?.kind === "batch"
          ? "导出所选暂存？"
          : "";
  const exportDialogDescription =
    exportPrompt?.kind === "one"
      ? `将「${exportPrompt.draft.name}」保存为「我的库」中的私有素材，并从暂存中移除该条。此操作不可撤销。`
      : exportPrompt?.kind === "all"
        ? `将当前列表中共 ${draftAssets.length} 条暂存逐条导入「我的库」，每条成功后会从暂存中移除。此操作不可撤销。`
        : exportPrompt?.kind === "batch"
          ? `将已选的 ${selectedIds.length} 条暂存导入「我的库」，每条成功后会从暂存中移除。此操作不可撤销。`
          : "";

  return (
    <>
      <ConfirmDialog
        open={exportPrompt !== null}
        onOpenChange={(o) => !o && setExportPrompt(null)}
        title={exportDialogTitle}
        description={exportDialogDescription}
        confirmLabel="确认导出"
        pendingLabel="导出中…"
        onConfirm={async () => {
          if (!exportPrompt) return;
          try {
            if (exportPrompt.kind === "one") {
              const sid = apiSessionForDraft(exportPrompt.draft);
              if (!sid) throw new Error("无法解析会话，请重试。");
              await exportDraftToLibrary(exportPrompt.draft, sid);
            } else if (exportPrompt.kind === "all") {
              await exportDraftsToLibrary(draftAssets, (d) => apiSessionForDraft(d));
            } else {
              const sel = draftAssets.filter((d) => selectedIds.includes(d.tempId));
              await exportDraftsToLibrary(sel, (d) => apiSessionForDraft(d));
              exitBulkMode();
            }
            invalidateAfterExport();
          } catch (e) {
            window.alert(e instanceof Error ? e.message : "导出失败，请重试。");
            throw e;
          }
        }}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="从暂存中删除？"
        description="删除后需重新手填；不会动「我的库」里已导出的素材。"
        confirmLabel="删除"
        tone="danger"
        pendingLabel="删除中…"
        onConfirm={async () => {
          if (!deleteTarget) return;
          const tid = deleteTarget;
          const owner = draftAssets.find((x) => x.tempId === tid);
          const sid = owner ? apiSessionForDraft(owner) : anchorSessionId;
          if (!sid) return;
          await deleteSessionDraft(sid, tid);
          if (editingId === tid) {
            setEditingId(null);
            setEditName("");
            setEditDesc("");
          }
          setDeleteTarget(null);
          invalidateAfterDraftMutation();
          if (owner?.ownerSessionId) {
            void qc.invalidateQueries({ queryKey: ["session", owner.ownerSessionId] });
          }
        }}
      />
      <aside
        className={cn(
          "flex min-h-0 min-w-0 flex-col overflow-hidden p-3",
          layout === "split" ? "h-full min-h-0" : "max-h-[42vh] border-t border-divider"
        )}
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-ui-mono text-[11px] uppercase text-text-muted">暂存（本组全部）</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {draftAssets.length > 0 && (
              <button
                type="button"
                className={cn(
                  "text-ui-mono rounded px-2 py-0.5 text-[11px]",
                  bulkMode ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text-primary"
                )}
                onClick={() => (bulkMode ? exitBulkMode() : setBulkMode(true))}
              >
                {bulkMode ? "退出多选" : "多选导出"}
              </button>
            )}
            <button
              type="button"
              className="text-ui-mono text-[11px] text-accent hover:underline"
              disabled={draftAssets.length === 0}
              onClick={() => setExportPrompt({ kind: "all" })}
            >
              全部导出
            </button>
          </div>
        </div>
        {group.draftStaging === "shared" && (
          <p className="text-ui-mono mt-0.5 shrink-0 text-[10px] leading-snug text-accent/80">
            组内共享暂存：以下为「{group.name}」内全部条目，任一会话中增删会同步。
          </p>
        )}
        {group.draftStaging === "independent" && (
          <p className="text-ui-mono mt-0.5 shrink-0 text-[10px] leading-snug text-text-muted/85">
            各会话独立暂存：以下为组内各会话暂存汇总；来源见各条目标注。
          </p>
        )}
        {bulkMode && draftAssets.length > 0 && (
          <div className="text-ui-mono mt-2 flex flex-wrap items-center gap-2 rounded border border-accent/20 bg-accent/[0.06] px-2.5 py-1.5 text-[10px] text-text-muted">
            <span>
              已选 <span className="text-accent">{selectedIds.length}</span> / {draftAssets.length}{" "}
              条
            </span>
            <span className="text-border/80">|</span>
            <button
              type="button"
              className="text-text-primary hover:text-accent"
              onClick={toggleSelectAllDrafts}
            >
              {allDraftsSelected ? "取消全选" : "全选"}
            </button>
            <button
              type="button"
              className="rounded bg-accent/20 px-2 py-0.5 text-accent disabled:cursor-not-allowed disabled:opacity-40"
              disabled={selectedIds.length === 0}
              onClick={() => setExportPrompt({ kind: "batch" })}
            >
              导出所选到「我的库」
            </button>
          </div>
        )}
        <p className="text-ui-mono mt-2 text-[11px] leading-relaxed text-text-muted/90">
          与 AI 聊天不会自动写入暂存。请手填
          <strong className="text-text-primary/90">名称</strong>与
          <strong className="text-text-primary/90">视觉描述</strong>后加入；可从本页直接导出到「我的库」。
        </p>

        {members.length > 1 && (
          <div className="mt-2 shrink-0">
            <p className="text-ui-mono text-[10px] uppercase tracking-wide text-text-muted">
              新增暂存归属会话
            </p>
            <ThemeSelect
              id={`group-draft-anchor-${groupId}`}
              aria-label="新增暂存归属会话"
              className="mt-1 max-w-none text-[12px]"
              value={anchorSessionId}
              options={members.map((m) => ({ value: m.id, label: m.title }))}
              onValueChange={(v) => setAnchorSessionId(v)}
            />
          </div>
        )}

        <form
          className="mt-3 space-y-2 border-b border-border/50 pb-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (draftSaving || !anchorSessionId) return;
            const n = draftName.trim();
            const d = draftDesc.trim();
            if (!n || !d) return;
            setDraftSaving(true);
            try {
              await postSessionDraft(anchorSessionId, { name: n, description: d });
              setDraftName("");
              setDraftDesc("");
              invalidateAfterDraftMutation();
              void qc.invalidateQueries({ queryKey: ["session", anchorSessionId] });
            } catch {
              // optional feedback
            } finally {
              setDraftSaving(false);
            }
          }}
        >
          <label className="block text-ui-mono text-[10px] uppercase text-text-muted">名称</label>
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="text-ui-mono w-full rounded border border-border/60 bg-surface/50 px-2 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent/50"
            placeholder="这条素材的称呼，例如：赛博义体维修站"
            maxLength={200}
            disabled={members.length === 0}
          />
          <label className="mt-1 block text-ui-mono text-[10px] uppercase text-text-muted">
            视觉描述
          </label>
          <textarea
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
            className="text-ui-mono min-h-16 w-full resize-y rounded border border-border/60 bg-surface/50 px-2 py-1.5 text-[12px] text-text-primary outline-none focus:border-accent/50"
            placeholder="如：夜雨、霓虹紫与湿路面反光、锈蚀金属、雾中霓虹灯条；偏俯视、中景、冷色主调等"
            maxLength={4000}
            disabled={members.length === 0}
          />
          <button
            type="submit"
            disabled={
              draftSaving || !draftName.trim() || !draftDesc.trim() || members.length === 0
            }
            className="text-ui-mono w-full rounded bg-accent/15 py-1.5 text-[12px] text-accent disabled:cursor-not-allowed disabled:opacity-50 hover:bg-accent/25"
          >
            {draftSaving ? "加入中…" : "加入暂存"}
          </button>
          {members.length === 0 && (
            <p className="text-ui-mono text-[10px] text-text-muted/85">
              组内尚无会话时无法新增暂存，请先新建并加入本分组。
            </p>
          )}
        </form>

        <div className="gd-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto pr-0.5">
          {draftAssets.length > 0 && (
            <motion.ul className="space-y-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {draftAssets.map((d) => (
                <li
                  key={`${d.ownerSessionId ?? "shared"}-${d.tempId}`}
                  className="rounded-md border border-border/60 bg-surface/50 p-2.5"
                >
                  <div className="flex gap-2">
                    {bulkMode && (
                      <input
                        type="checkbox"
                        className="mt-1.5 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-border text-accent focus:ring-accent"
                        checked={selectedIds.includes(d.tempId)}
                        onChange={() => toggleDraftSelect(d.tempId)}
                        aria-label={`选择 ${d.name}`}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      {editingId === d.tempId ? (
                        <form
                          className="space-y-2"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (editSaving) return;
                            const n = editName.trim();
                            const t = editDesc.trim();
                            if (!n || !t) return;
                            const sid = apiSessionForDraft(d);
                            if (!sid) return;
                            setEditSaving(true);
                            try {
                              await patchSessionDraft(sid, d.tempId, {
                                name: n,
                                description: t,
                              });
                              setEditingId(null);
                              invalidateAfterDraftMutation();
                              void qc.invalidateQueries({ queryKey: ["session", sid] });
                            } finally {
                              setEditSaving(false);
                            }
                          }}
                        >
                          <p className="text-ui-mono text-[9px] text-text-muted/80">名称</p>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="text-ui-mono w-full rounded border border-border/60 bg-bg-base px-2 py-1 text-[13px] text-text-primary outline-none focus:border-accent/50"
                            maxLength={200}
                          />
                          <p className="text-ui-mono text-[9px] text-text-muted/80">视觉描述</p>
                          <textarea
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            className="text-ui-mono min-h-20 w-full resize-y rounded border border-border/60 bg-bg-base px-2 py-1.5 text-[12px] text-text-primary outline-none focus:border-accent/50"
                            placeholder="画面、色光、材质、氛围、镜头感等（非玩法/规则）"
                            maxLength={4000}
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="text-ui-mono text-[11px] text-text-muted hover:text-text-primary"
                              onClick={() => {
                                setEditingId(null);
                                setEditName("");
                                setEditDesc("");
                              }}
                            >
                              取消
                            </button>
                            <button
                              type="submit"
                              disabled={editSaving || !editName.trim() || !editDesc.trim()}
                              className="text-ui-mono rounded bg-accent/15 px-2.5 py-1 text-[11px] text-accent disabled:opacity-50"
                            >
                              {editSaving ? "保存中…" : "保存"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          {d.ownerSessionId && group.draftStaging === "independent" && (
                            <p className="text-ui-mono mb-1 text-[9px] text-text-muted/80">
                              来自：{d.ownerSessionTitle ?? "组内会话"}
                            </p>
                          )}
                          <p className="font-display line-clamp-2 text-sm text-text-primary">{d.name}</p>
                          <p className="text-ui-mono mt-0.5 line-clamp-4 text-[11px] leading-relaxed text-text-muted">
                            {d.description}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 border-t border-border/40 pt-2">
                            <button
                              type="button"
                              className="text-ui-mono text-[10px] text-accent hover:underline"
                              onClick={() => setExportPrompt({ kind: "one", draft: d })}
                            >
                              导出到库
                            </button>
                            <button
                              type="button"
                              className="text-ui-mono text-[10px] text-text-muted hover:text-accent"
                              onClick={() => {
                                setEditingId(d.tempId);
                                setEditName(d.name);
                                setEditDesc(d.description);
                              }}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="text-ui-mono text-[10px] text-error-dim/90 hover:text-error-dim"
                              onClick={() => setDeleteTarget(d.tempId)}
                            >
                              删除
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </motion.ul>
          )}
          {draftAssets.length === 0 && (
            <p className="text-ui-mono py-2 text-center text-[11px] text-text-muted/90">
              {members.length === 0
                ? "暂无暂存。添加组内会话后即可在此新增。"
                : "暂无暂存。在上方填写名称与「视觉描述」并加入后，会在此列表显示。"}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
