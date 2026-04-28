"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  getSession,
  listSessionStagingGroups,
  postSessionDraft,
  patchSessionDraft,
  deleteSessionDraft,
  exportDraftsToLibrary,
  exportDraftToLibrary,
} from "@/lib/api";
import type { DraftAsset, SessionDetail } from "@/lib/types";
import { ChatThreadPanel } from "@/components/session/ChatThreadPanel";
import { useDiscardEmptySessionOnLeave } from "@/hooks/useDiscardEmptySessionOnLeave";

type ExportPrompt =
  | null
  | { kind: "one"; draft: DraftAsset }
  | { kind: "all" }
  | { kind: "batch" };
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { WorkspaceHorizontalSplit } from "@/components/shell/WorkspaceHorizontalSplit";
import { WorkspaceVerticalSplit } from "@/components/shell/WorkspaceVerticalSplit";
import { motion } from "framer-motion";

export function SessionWorkspace({ id, initial }: { id: string; initial: SessionDetail }) {
  const qc = useQueryClient();
  const { data: session = initial, refetch } = useQuery({
    queryKey: ["session", id],
    queryFn: () => getSession(id) as Promise<SessionDetail | null>,
    initialData: initial,
    // RSC `initial` is not applied when this query already has cache; treat as stale so we
    // always refetch on mount and avoid showing empty/outdated messages until manual refresh.
    initialDataUpdatedAt: 0,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: stagingGroups = [] } = useQuery({
    queryKey: ["session-staging-groups"],
    queryFn: listSessionStagingGroups,
  });
  const [streaming, setStreaming] = useState(false);
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
  /** After single-draft export succeeds, show detail link before closing. */
  const [oneExportAssetId, setOneExportAssetId] = useState<string | null>(null);
  /** Only mount one chat/drafts split: hidden duplicate Groups get size 0 and break react-resizable-panels. */
  const [chatDraftsWide, setChatDraftsWide] = useState(true);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setChatDraftsWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const draftAssets = session?.draftAssets ?? [];

  const isEmptySessionDiscardable = useCallback(() => {
    if (!session) return false;
    if (streaming) return false;
    if ((session.messages ?? []).some((m) => m.role === "user")) return false;
    if (session.stagingGroup?.draftStaging !== "shared" && (session.draftAssets?.length ?? 0) > 0) {
      return false;
    }
    return true;
  }, [session, streaming]);
  useDiscardEmptySessionOnLeave(id, isEmptySessionDiscardable);

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

  const exitBulkMode = useCallback(() => {
    setBulkMode(false);
    setSelectedIds([]);
  }, []);

  const draftOwnerSessionId = useCallback(
    (tempId: string) => draftAssets.find((d) => d.tempId === tempId)?.ownerSessionId ?? id,
    [draftAssets, id]
  );

  if (!session) return <p className="p-6 text-text-muted">未找到会话</p>;

  function makeSessionColumns(forSplit: boolean, s: SessionDetail): { editor: ReactNode; drafts: ReactNode } {
    const editor = (
      <div
        className={cn(
          // h-full: keep vertical split (messages | composer) height so bottom panel never collapses to 0
          // No border-r / box border: WorkspaceHorizontalSplit Separator already draws the divider vs drafts.
          "gd-editor-panel relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
        )}
      >
        <div className="pointer-events-none absolute inset-0 z-0">
          <span className="gd-editor-panel__blade" aria-hidden />
          <span className="gd-editor-panel__corners" aria-hidden />
        </div>
        <p className="text-ui-mono pointer-events-none absolute right-1.5 top-1 z-[1] text-xs tracking-wider text-accent/25">
          {(() => {
            let h = 0;
            for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
            return ((h >>> 0) & 0xffff).toString(16).padStart(4, "0");
          })()}
        </p>
        <ChatThreadPanel
          sessionId={id}
          session={s}
          refetch={refetch}
          showStagingGroupMenu={true}
          stagingGroups={stagingGroups}
          composerPlaceholder="和 AI 聊方向、灵感即可；右侧「视觉描述」再写进私库卡片的画面感。"
          onStreamingChange={setStreaming}
        />
      </div>
    );
    const drafts = (
          <aside
            className={cn(
              "flex min-h-0 min-w-0 flex-col overflow-hidden p-3",
              forSplit ? "h-full min-h-0" : "max-h-[42vh] border-t border-divider"
            )}
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
              <h2 className="text-ui-mono text-xs uppercase text-text-muted">暂存</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                {draftAssets.length > 0 && (
                  <button
                    type="button"
                    className={cn(
                      "text-ui-mono rounded px-2 py-0.5 text-xs",
                      bulkMode
                        ? "bg-accent/15 text-accent"
                        : "text-text-muted hover:text-text-primary"
                    )}
                    onClick={() => (bulkMode ? exitBulkMode() : setBulkMode(true))}
                  >
                    {bulkMode ? "退出多选" : "多选导出"}
                  </button>
                )}
                <button
                  type="button"
                  className="text-ui-mono text-xs text-accent hover:underline"
                  disabled={draftAssets.length === 0}
                  onClick={() => {
                    setOneExportAssetId(null);
                    setExportPrompt({ kind: "all" });
                  }}
                >
                  全部导出
                </button>
              </div>
            </div>
            {s.stagingGroup?.draftStaging === "shared" && (
              <p className="text-ui-mono mt-0.5 shrink-0 text-xs leading-snug text-text-muted/85">
                当前分组为共享暂存：同组会话里会看到同一份列表，增删会同步。
              </p>
            )}
            {bulkMode && draftAssets.length > 0 && (
              <div className="text-ui-mono mt-2 flex flex-wrap items-center gap-2 rounded border border-accent/20 bg-accent/[0.06] px-2.5 py-1.5 text-xs text-text-muted">
                <span>
                  已选 <span className="text-accent">{selectedIds.length}</span> / {draftAssets.length} 条
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
                  onClick={() => {
                    setOneExportAssetId(null);
                    setExportPrompt({ kind: "batch" });
                  }}
                >
                  导出所选到「我的库」
                </button>
              </div>
            )}
            <p className="text-ui-mono mt-2 text-xs leading-relaxed text-text-muted/90">
              与 AI 聊天不会自动写入暂存。请在此为每条素材手填
              <strong className="text-text-primary/90">名称</strong>（怎么称呼它）和
              <strong className="text-text-primary/90">视觉描述</strong>（长什么样、色调、材质、光感、氛围、构图等——不是玩法/系统说明）；
              加入暂存后，可
              <strong className="text-text-primary/90">单条「导出到库」</strong>、
              <strong className="text-text-primary/90">「多选导出」</strong> 或
              <strong className="text-text-primary/90">「全部导出」</strong> 到「我的库」。
            </p>
            <form
              className="mt-3 space-y-2 border-b border-border/50 pb-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (draftSaving) return;
                const n = draftName.trim();
                const d = draftDesc.trim();
                if (!n || !d) return;
                setDraftSaving(true);
                try {
                  await postSessionDraft(id, { name: n, description: d });
                  setDraftName("");
                  setDraftDesc("");
                  void refetch();
                  void qc.invalidateQueries({ queryKey: ["session", id] });
                  void qc.invalidateQueries({ queryKey: ["sessions"] });
                  if (s.stagingGroup?.id) {
                    void qc.invalidateQueries({
                      queryKey: ["session-staging-group-drafts", s.stagingGroup.id],
                    });
                  }
                } catch {
                  // user feedback optional
                } finally {
                  setDraftSaving(false);
                }
              }}
            >
              <label className="block text-ui-mono text-xs uppercase text-text-muted">名称</label>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="text-ui-mono w-full rounded border border-border/60 bg-surface/50 px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50"
                placeholder="这条素材的称呼，例如：赛博义体维修站"
                maxLength={200}
              />
              <label className="mt-1 block text-ui-mono text-xs uppercase text-text-muted">视觉描述</label>
              <textarea
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                className="text-ui-mono min-h-16 w-full resize-y rounded border border-border/60 bg-surface/50 px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50"
                placeholder="如：夜雨、霓虹紫与湿路面反光、锈蚀金属、雾中霓虹灯条；偏俯视、中景、冷色主调等"
                maxLength={4000}
              />
              <button
                type="submit"
                disabled={draftSaving || !draftName.trim() || !draftDesc.trim()}
                className="text-ui-mono w-full rounded bg-accent/15 py-1.5 text-xs text-accent disabled:cursor-not-allowed disabled:opacity-50 hover:bg-accent/25"
              >
                {draftSaving ? "加入中…" : "加入暂存"}
              </button>
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
                          setEditSaving(true);
                          try {
                            await patchSessionDraft(d.ownerSessionId ?? id, d.tempId, {
                              name: n,
                              description: t,
                            });
                            setEditingId(null);
                            void refetch();
                            void qc.invalidateQueries({ queryKey: ["session", id] });
                            void qc.invalidateQueries({ queryKey: ["sessions"] });
                            if (s.stagingGroup?.id) {
                              void qc.invalidateQueries({
                                queryKey: ["session-staging-group-drafts", s.stagingGroup.id],
                              });
                            }
                          } finally {
                            setEditSaving(false);
                          }
                        }}
                      >
                        <p className="text-ui-mono text-xs text-text-muted/80">名称</p>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="text-ui-mono w-full rounded border border-border/60 bg-bg-base px-2 py-1 text-sm text-text-primary outline-none focus:border-accent/50"
                          maxLength={200}
                        />
                        <p className="text-ui-mono text-xs text-text-muted/80">视觉描述</p>
                        <textarea
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          className="text-ui-mono min-h-20 w-full resize-y rounded border border-border/60 bg-bg-base px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50"
                          placeholder="画面、色光、材质、氛围、镜头感等（非玩法/规则）"
                          maxLength={4000}
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="text-ui-mono text-xs text-text-muted hover:text-text-primary"
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
                            className="text-ui-mono rounded bg-accent/15 px-2.5 py-1 text-xs text-accent disabled:opacity-50"
                          >
                            {editSaving ? "保存中…" : "保存"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p className="font-display line-clamp-2 text-sm text-text-primary">{d.name}</p>
                        <p className="text-ui-mono mt-0.5 line-clamp-4 text-xs leading-relaxed text-text-muted">
                          {d.description}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 border-t border-border/40 pt-2">
                          <button
                            type="button"
                            className="text-ui-mono text-xs text-accent hover:underline"
                            onClick={() => {
                              setOneExportAssetId(null);
                              setExportPrompt({ kind: "one", draft: d });
                            }}
                          >
                            导出到库
                          </button>
                          <button
                            type="button"
                            className="text-ui-mono text-xs text-text-muted hover:text-accent"
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
                            className="text-ui-mono text-xs text-error-dim/90 hover:text-error-dim"
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
              <p className="text-ui-mono py-2 text-center text-xs text-text-muted/90">
                暂无暂存。在上方填写名称与「视觉描述」并加入后，会在此列表显示。
              </p>
            )}
            </div>
          </aside>
    );
    return { editor, drafts };
  }

  const split = makeSessionColumns(true, session);

  const oneExportDone = exportPrompt?.kind === "one" && oneExportAssetId !== null;

  const exportDialogTitle =
    oneExportDone
      ? "已导出到「我的库」"
      : exportPrompt?.kind === "one"
        ? "导出到「我的库」？"
        : exportPrompt?.kind === "all"
          ? "导出全部暂存？"
          : exportPrompt?.kind === "batch"
            ? "导出所选暂存？"
            : "";
  const exportDialogDescription =
    oneExportDone
      ? `「${exportPrompt.draft.name}」已保存为私有素材，可从下方链接在新标签页打开详情。`
      : exportPrompt?.kind === "one"
        ? `将「${exportPrompt.draft.name}」保存为「我的库」中的私有素材，并从暂存中移除该条。此操作不可撤销。`
        : exportPrompt?.kind === "all"
          ? `将当前列表中共 ${draftAssets.length} 条暂存逐条导入「我的库」，每条成功后会从暂存中移除。此操作不可撤销。`
          : exportPrompt?.kind === "batch"
            ? `将已选的 ${selectedIds.length} 条暂存导入「我的库」，每条成功后会从暂存中移除。此操作不可撤销。`
            : "";

  const invalidateAfterExport = () => {
    void refetch();
    void qc.invalidateQueries({ queryKey: ["session", id] });
    void qc.invalidateQueries({ queryKey: ["sessions"] });
    void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
    void qc.invalidateQueries({ queryKey: ["assets"] });
    const gid = session.stagingGroup?.id;
    if (gid) {
      void qc.invalidateQueries({ queryKey: ["session-staging-group-drafts", gid] });
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <ConfirmDialog
        open={exportPrompt !== null}
        onOpenChange={(o) => {
          if (!o) {
            setExportPrompt(null);
            setOneExportAssetId(null);
          }
        }}
        title={exportDialogTitle}
        description={exportDialogDescription}
        footer={oneExportDone ? "close-only" : "default"}
        closeOnSuccess={exportPrompt?.kind === "one" && !oneExportDone}
        confirmLabel="确认导出"
        pendingLabel="导出中…"
        onConfirm={async () => {
          if (!exportPrompt) return;
          try {
            if (exportPrompt.kind === "one") {
              const asset = await exportDraftToLibrary(
                exportPrompt.draft,
                draftOwnerSessionId(exportPrompt.draft.tempId)
              );
              setOneExportAssetId(asset.id);
            } else if (exportPrompt.kind === "all") {
              await exportDraftsToLibrary(draftAssets, (d) => draftOwnerSessionId(d.tempId));
            } else {
              const sel = draftAssets.filter((d) => selectedIds.includes(d.tempId));
              await exportDraftsToLibrary(sel, (d) => draftOwnerSessionId(d.tempId));
              exitBulkMode();
            }
            invalidateAfterExport();
          } catch (e) {
            window.alert(e instanceof Error ? e.message : "导出失败，请重试。");
            throw e;
          }
        }}
      >
        {oneExportDone && oneExportAssetId ? (
          <Link
            href={`/library/assets/${oneExportAssetId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-accent underline-offset-2 hover:underline"
          >
            打开素材详情页（新标签页）
          </Link>
        ) : null}
      </ConfirmDialog>
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
          const owner = draftOwnerSessionId(tid);
          await deleteSessionDraft(owner, tid);
          if (editingId === tid) {
            setEditingId(null);
            setEditName("");
            setEditDesc("");
          }
          setDeleteTarget(null);
          void refetch();
          void qc.invalidateQueries({ queryKey: ["session", id] });
          void qc.invalidateQueries({ queryKey: ["sessions"] });
          void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
          if (session.stagingGroup?.id) {
            void qc.invalidateQueries({
              queryKey: ["session-staging-group-drafts", session.stagingGroup.id],
            });
          }
        }}
      />
      <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
        {chatDraftsWide ? (
          <WorkspaceHorizontalSplit
            storageKey="layout:session-chat-drafts"
            leftDefaultSize={56}
            leftMinSize={28}
            rightMinSize={22}
            className="h-full min-h-0 min-w-0 flex-1"
            left={split.editor}
            right={split.drafts}
          />
        ) : (
          <WorkspaceVerticalSplit
            storageKey="layout:session-chat-drafts-stack"
            topDefaultSize={60}
            bottomDefaultSize={40}
            topMinSize={22}
            bottomMinSize={18}
            className="h-full min-h-0 min-w-0"
            top={split.editor}
            bottom={split.drafts}
          />
        )}
      </div>
    </div>
  );
}
