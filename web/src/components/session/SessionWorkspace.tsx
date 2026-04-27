"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  getSession,
  listSessionStagingGroups,
  listSessionStagingGroupDrafts,
  patchSession,
  patchSessionStagingGroup,
  postChatStream,
  postSessionDraft,
  patchSessionDraft,
  deleteSessionDraft,
  exportDraftsToLibrary,
  exportDraftToLibrary,
} from "@/lib/api";
import { createStreamParser } from "@/lib/stream-jsonl";
import type { DraftAsset, SessionDetail, StreamEvent, StagingGroupDraft } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ThemeSelect } from "@/components/ui/ThemeSelect";
import { WorkspaceHorizontalSplit } from "@/components/shell/WorkspaceHorizontalSplit";
import { WorkspaceVerticalSplit } from "@/components/shell/WorkspaceVerticalSplit";
import { motion } from "framer-motion";
import { Settings2 } from "lucide-react";

export function SessionWorkspace({ id, initial }: { id: string; initial: SessionDetail }) {
  const qc = useQueryClient();
  const { data: session = initial, refetch } = useQuery({
    queryKey: ["session", id],
    queryFn: () => getSession(id) as Promise<SessionDetail | null>,
    initialData: initial,
  });
  const { data: stagingGroups = [] } = useQuery({
    queryKey: ["session-staging-groups"],
    queryFn: listSessionStagingGroups,
  });
  const [groupSelectBusy, setGroupSelectBusy] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [textBuf, setTextBuf] = useState("");
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
  const [exportOneId, setExportOneId] = useState<string | null>(null);
  const [exportBatchBusy, setExportBatchBusy] = useState(false);
  const [groupLeftTab, setGroupLeftTab] = useState<"settings" | "chat">("settings");
  const [groupNameField, setGroupNameField] = useState("");
  const [groupSettingsBusy, setGroupSettingsBusy] = useState(false);

  const onEvent = useCallback((ev: StreamEvent) => {
    if (ev.type === "text") {
      setTextBuf((t) => t + ev.delta);
    }
  }, []);

  const messages = useMemo(() => session?.messages ?? [], [session]);
  const groupIdForDrafts = session?.stagingGroup?.id;
  const { data: groupDraftsList } = useQuery({
    queryKey: ["session-staging-group-drafts", groupIdForDrafts],
    queryFn: () => listSessionStagingGroupDrafts(groupIdForDrafts!),
    enabled: !!groupIdForDrafts,
  });
  const draftAssets = useMemo(() => {
    if (!groupIdForDrafts) return session?.draftAssets ?? [];
    if (groupDraftsList !== undefined) return groupDraftsList;
    return session?.draftAssets ?? [];
  }, [groupIdForDrafts, groupDraftsList, session?.draftAssets]);

  const selectedDrafts: DraftAsset[] = useMemo(
    () => draftAssets.filter((d) => selectedIds.includes(d.tempId)),
    [draftAssets, selectedIds]
  );
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

  useEffect(() => {
    setGroupLeftTab("settings");
  }, [id, session?.stagingGroup?.id]);

  useEffect(() => {
    const g = stagingGroups.find((x) => x.id === session?.stagingGroup?.id);
    setGroupNameField(g?.name ?? "");
  }, [session?.stagingGroup?.id, stagingGroups]);

  if (!session) return <p className="p-6 text-text-muted">未找到会话</p>;

  function makeSessionColumns(forSplit: boolean, s: SessionDetail): { editor: ReactNode; drafts: ReactNode } {
    const stagingGroupMeta = s.stagingGroup
      ? stagingGroups.find((g) => g.id === s.stagingGroup!.id)
      : undefined;
    const panelDraftMode: StagingGroupDraft =
      (stagingGroupMeta?.draftStaging ?? s.stagingGroup?.draftStaging) ?? "independent";

    const sessionChatSplit = (
              <WorkspaceVerticalSplit
                storageKey="layout:session-chat-composer"
                topDefaultSize={74}
                topMinSize={30}
                bottomMinSize={12}
                className="min-h-0 min-w-0 flex-1"
                topClassName="min-h-0 min-w-0"
                bottomClassName="min-h-0 min-w-0"
                top={
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="gd-scrollbar min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-white/[0.02] to-transparent">
                      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 py-3 sm:px-4">
                        {messages.map((m) => (
                          <div
                            key={m.id}
                            className={cn("flex w-full", m.role === "user" ? "justify-end" : "justify-start")}
                          >
                            <div
                              className={cn(
                                "max-w-[min(90%,20rem)] shadow-md sm:max-w-md",
                                "rounded-2xl px-3.5 py-2.5 text-[14px] leading-[1.65] [word-break:break-word] whitespace-pre-wrap",
                                m.role === "user"
                                  ? "rounded-tr-md border border-accent/35 bg-gradient-to-br from-accent/20 to-accent/[0.08] text-text-primary"
                                  : "rounded-tl-md border border-border/80 bg-surface/90 text-text-primary/95 shadow-black/5 backdrop-blur-sm"
                              )}
                            >
                              {m.role === "assistant" && (
                                <p className="text-ui-mono mb-1 text-[9px] uppercase tracking-widest text-text-muted/80">
                                  AI
                                </p>
                              )}
                              <p
                                className={cn(
                                  m.role === "user" ? "text-inter" : "text-ui-mono"
                                )}
                              >
                                {m.content}
                              </p>
                            </div>
                          </div>
                        ))}
                        {streaming && (
                          <div className="flex w-full justify-start">
                            <div className="max-w-[min(90%,20rem)] rounded-2xl rounded-tl-md border border-dashed border-accent/25 bg-surface/60 px-3.5 py-2.5 text-[14px] leading-[1.65] text-text-primary/90 shadow-md backdrop-blur-sm sm:max-w-md">
                              <p className="text-ui-mono mb-1 text-[9px] uppercase tracking-widest text-text-muted/70">
                                AI
                              </p>
                              <p className="text-ui-mono [word-break:break-word] whitespace-pre-wrap">
                                {textBuf}
                                <span
                                  className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-accent align-middle"
                                  aria-hidden
                                />
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                }
                bottom={
                  <div className="box-border flex h-full min-h-0 flex-col px-3 py-2">
                    <form
                      className="flex min-h-0 flex-1 gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!input.trim() || streaming) return;
                        setStreaming(true);
                        setTextBuf("");
                        try {
                          const res = await postChatStream(id, input);
                          if (!res.ok) throw new Error("chat");
                          const reader = res.body?.getReader();
                          if (!reader) return;
                          const dec = new TextDecoder();
                          const feed = createStreamParser(onEvent);
                          for (;;) {
                            const { value, done } = await reader.read();
                            if (done) break;
                            feed(dec.decode(value, { stream: true }));
                          }
                          setInput("");
                          void refetch();
                          void qc.invalidateQueries({ queryKey: ["session", id] });
                          void qc.invalidateQueries({ queryKey: ["sessions"] });
                        } catch {
                          // ignore
                        } finally {
                          setStreaming(false);
                          setTextBuf("");
                          void refetch();
                          void qc.invalidateQueries({ queryKey: ["sessions"] });
                        }
                      }}
                    >
                      <textarea
                        className="text-ui-mono box-border max-h-none min-h-12 w-0 min-w-0 flex-1 resize-none overflow-y-auto border-b border-accent/40 bg-transparent text-sm text-text-primary outline-none focus:border-accent"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            e.currentTarget.form?.requestSubmit();
                          }
                        }}
                        placeholder="和 AI 聊方向、灵感即可；右侧「视觉描述」再写进私库卡片的画面感。"
                        rows={1}
                        aria-label="聊天输入"
                      />
                      <button
                        type="submit"
                        className="gd-btn-dataflow text-ui-mono shrink-0 self-end rounded border border-border px-3 py-1 text-sm hover:border-accent/40"
                        disabled={streaming}
                      >
                        发送
                      </button>
                    </form>
                  </div>
                }
              />
    );

    const groupSettingsPanel = s.stagingGroup ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="gd-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
            <p className="text-ui-mono text-[10px] uppercase tracking-wide text-text-muted">分组名称</p>
            <div className="mt-1 flex flex-wrap items-stretch gap-2">
              <input
                className="text-ui-mono min-w-[10rem] flex-1 rounded border border-border/60 bg-surface/50 px-2 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent/50"
                value={groupNameField}
                onChange={(e) => setGroupNameField(e.target.value)}
                maxLength={120}
                disabled={groupSettingsBusy}
              />
              <button
                type="button"
                className="text-ui-mono shrink-0 rounded bg-accent/15 px-3 py-1.5 text-[12px] text-accent hover:bg-accent/25 disabled:opacity-40"
                disabled={
                  groupSettingsBusy ||
                  !groupNameField.trim() ||
                  groupNameField.trim() === (stagingGroupMeta?.name ?? s.stagingGroup.name)
                }
                onClick={async () => {
                  if (!s.stagingGroup || !groupNameField.trim()) return;
                  setGroupSettingsBusy(true);
                  try {
                    await patchSessionStagingGroup(s.stagingGroup.id, {
                      name: groupNameField.trim(),
                    });
                    void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
                    await refetch();
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

            <p className="text-ui-mono mt-4 text-[10px] uppercase tracking-wide text-text-muted">暂存模式</p>
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
                  "text-ui-mono flex-1 rounded px-1.5 py-1.5 text-left text-[10px] outline-none transition-colors disabled:opacity-40",
                  panelDraftMode === "independent"
                    ? "bg-accent/15 text-accent"
                    : "text-text-muted hover:text-text-primary"
                )}
                disabled={groupSettingsBusy}
                onClick={async () => {
                  if (!s.stagingGroup || panelDraftMode === "independent") return;
                  setGroupSettingsBusy(true);
                  try {
                    await patchSessionStagingGroup(s.stagingGroup.id, {
                      draftStaging: "independent",
                    });
                    void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
                    await refetch();
                    void qc.invalidateQueries({ queryKey: ["sessions"] });
                    void qc.invalidateQueries({
                      queryKey: ["session-staging-group-drafts", s.stagingGroup.id],
                    });
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
                  "text-ui-mono flex-1 rounded px-1.5 py-1.5 text-left text-[10px] outline-none transition-colors disabled:opacity-40",
                  panelDraftMode === "shared"
                    ? "bg-accent/15 text-accent"
                    : "text-text-muted hover:text-text-primary"
                )}
                disabled={groupSettingsBusy}
                onClick={async () => {
                  if (!s.stagingGroup || panelDraftMode === "shared") return;
                  setGroupSettingsBusy(true);
                  try {
                    await patchSessionStagingGroup(s.stagingGroup.id, {
                      draftStaging: "shared",
                    });
                    void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
                    await refetch();
                    void qc.invalidateQueries({ queryKey: ["sessions"] });
                    void qc.invalidateQueries({
                      queryKey: ["session-staging-group-drafts", s.stagingGroup.id],
                    });
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
            <p className="text-ui-mono mt-2 text-[10px] leading-relaxed text-text-muted/90">
              {panelDraftMode === "shared"
                ? "共享：全组合用一套暂存池，任一会话里增删会同步。"
                : "独立：每条暂存归属具体会话；右侧仍汇总本组全部条目。"}
            </p>

            <p className="text-ui-mono mt-4 text-[10px] uppercase tracking-wide text-text-muted">
              本会话所在分组
            </p>
            <ThemeSelect
              id={`sg-panel-${id}`}
              aria-label="将本会话移至其他分组"
              className="mt-1.5 max-w-none text-[12px]"
              disabled={groupSelectBusy || groupSettingsBusy}
              value={s.stagingGroup.id}
              options={[
                { value: "", label: "无（移出分组）" },
                ...stagingGroups.map((g) => ({ value: g.id, label: g.name })),
              ]}
              onValueChange={async (v) => {
                setGroupSelectBusy(true);
                try {
                  await patchSession(id, { stagingGroupId: v === "" ? null : v });
                  await refetch();
                  void qc.invalidateQueries({ queryKey: ["sessions"] });
                  void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
                  void qc.invalidateQueries({ queryKey: ["session-staging-group-drafts"] });
                } catch {
                  // ignore
                } finally {
                  setGroupSelectBusy(false);
                }
              }}
            />
            <p className="text-ui-mono mt-2 text-[10px] leading-relaxed text-text-muted/80">
              右侧「暂存」列为本组全部条目；在此新增的暂存仍归属当前会话「{s.title}」。
            </p>
          </div>
        </div>
      ) : null;

    const editor = (
      <div
        className={cn(
          "gd-editor-panel relative flex min-h-0 min-w-0 flex-col overflow-hidden border-divider",
          !forSplit && "border-r"
        )}
      >
        <div className="pointer-events-none absolute inset-0 z-0">
          <span className="gd-editor-panel__blade" aria-hidden />
          <span className="gd-editor-panel__corners" aria-hidden />
        </div>
        <p className="text-ui-mono pointer-events-none absolute right-1.5 top-1 z-[1] text-[7px] tracking-wider text-accent/25">
          {(() => {
            let h = 0;
            for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
            return ((h >>> 0) & 0xffff).toString(16).padStart(4, "0");
          })()}
        </p>
        <div className="relative z-[2] flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="shrink-0 px-2 pb-1 pt-2">
            <div className="flex items-center justify-center gap-1.5">
              <p className="text-ui-mono min-w-0 flex-1 text-center text-[11px] text-text-muted/70">
                {s.title}
              </p>
              {!s.stagingGroup && (
                <DropdownMenu.Root modal={false}>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      className="text-ui-mono shrink-0 rounded border border-border/50 bg-surface/40 p-1 text-text-muted hover:border-accent/30 hover:text-text-primary"
                      title="分组与暂存"
                      aria-label="分组与暂存"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="text-ui-mono z-[100] min-w-[14rem] rounded-md border border-border bg-bg-base p-3 shadow-lg"
                      sideOffset={6}
                      align="end"
                    >
                      <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                        所属分组
                      </p>
                      <ThemeSelect
                        id={`sg-${id}`}
                        aria-label="会话分组"
                        className="mt-1.5 max-w-none text-[12px]"
                        disabled={groupSelectBusy}
                        value=""
                        options={[
                          { value: "", label: "无" },
                          ...stagingGroups.map((g) => ({ value: g.id, label: g.name })),
                        ]}
                        onValueChange={async (v) => {
                          setGroupSelectBusy(true);
                          try {
                            await patchSession(id, { stagingGroupId: v === "" ? null : v });
                            await refetch();
                            void qc.invalidateQueries({ queryKey: ["sessions"] });
                            void qc.invalidateQueries({ queryKey: ["session-staging-groups"] });
                            void qc.invalidateQueries({ queryKey: ["session-staging-group-drafts"] });
                          } catch {
                            // ignore
                          } finally {
                            setGroupSelectBusy(false);
                          }
                        }}
                      />
                      <p className="mt-2 text-[10px] leading-relaxed text-text-muted/80">
                        未加入分组时，仅本会话的暂存显示在右侧。加入分组后可在左栏「分组设置」中管理。
                      </p>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
            </div>
            {s.stagingGroup && (
              <div
                className="mt-2 flex rounded border border-border/60 bg-surface/30 p-0.5"
                role="tablist"
                aria-label="左栏主内容"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={groupLeftTab === "settings"}
                  className={cn(
                    "text-ui-mono flex-1 rounded px-2 py-1.5 text-[11px] outline-none transition-colors",
                    groupLeftTab === "settings"
                      ? "bg-accent/15 text-accent"
                      : "text-text-muted hover:text-text-primary"
                  )}
                  onClick={() => setGroupLeftTab("settings")}
                >
                  分组设置
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={groupLeftTab === "chat"}
                  className={cn(
                    "text-ui-mono flex-1 rounded px-2 py-1.5 text-[11px] outline-none transition-colors",
                    groupLeftTab === "chat"
                      ? "bg-accent/15 text-accent"
                      : "text-text-muted hover:text-text-primary"
                  )}
                  onClick={() => setGroupLeftTab("chat")}
                >
                  本会话聊天
                </button>
              </div>
            )}
          </div>
          {s.stagingGroup && groupLeftTab === "settings" ? groupSettingsPanel : sessionChatSplit}
        </div>
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
              <h2 className="text-ui-mono text-[11px] uppercase text-text-muted">
                {s.stagingGroup ? "暂存（本组全部）" : "暂存"}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5">
                {draftAssets.length > 0 && (
                  <button
                    type="button"
                    className={cn(
                      "text-ui-mono rounded px-2 py-0.5 text-[11px]",
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
                  className="text-ui-mono text-[11px] text-accent hover:underline"
                  disabled={draftAssets.length === 0}
                  onClick={async () => {
                    if (draftAssets.length === 0) return;
                    await exportDraftsToLibrary(draftAssets);
                    void qc.invalidateQueries({ queryKey: ["assets"] });
                  }}
                >
                  全部导出
                </button>
              </div>
            </div>
            {s.stagingGroup?.draftStaging === "shared" && (
              <p className="text-ui-mono mt-0.5 shrink-0 text-[10px] leading-snug text-accent/80">
                组内共享暂存：右侧为「{s.stagingGroup.name}」内全部条目，任一会话中增删会同步。
              </p>
            )}
            {s.stagingGroup?.draftStaging === "independent" && (
              <p className="text-ui-mono mt-0.5 shrink-0 text-[10px] leading-snug text-text-muted/85">
                各会话独立暂存：右侧汇总「{s.stagingGroup.name}」下所有会话的暂存；来源见各条目标注。
              </p>
            )}
            {bulkMode && draftAssets.length > 0 && (
              <div className="text-ui-mono mt-2 flex flex-wrap items-center gap-2 rounded border border-accent/20 bg-accent/[0.06] px-2.5 py-1.5 text-[10px] text-text-muted">
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
                  disabled={selectedIds.length === 0 || exportBatchBusy}
                  onClick={async () => {
                    if (selectedDrafts.length === 0) return;
                    setExportBatchBusy(true);
                    try {
                      await exportDraftsToLibrary(selectedDrafts);
                      void qc.invalidateQueries({ queryKey: ["assets"] });
                      exitBulkMode();
                    } finally {
                      setExportBatchBusy(false);
                    }
                  }}
                >
                  {exportBatchBusy ? "导出中…" : "导出所选到「我的库」"}
                </button>
              </div>
            )}
            <p className="text-ui-mono mt-2 text-[11px] leading-relaxed text-text-muted/90">
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
              <label className="block text-ui-mono text-[10px] uppercase text-text-muted">名称</label>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="text-ui-mono w-full rounded border border-border/60 bg-surface/50 px-2 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent/50"
                placeholder="这条素材的称呼，例如：赛博义体维修站"
                maxLength={200}
              />
              <label className="mt-1 block text-ui-mono text-[10px] uppercase text-text-muted">视觉描述</label>
              <textarea
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                className="text-ui-mono min-h-16 w-full resize-y rounded border border-border/60 bg-surface/50 px-2 py-1.5 text-[12px] text-text-primary outline-none focus:border-accent/50"
                placeholder="如：夜雨、霓虹紫与湿路面反光、锈蚀金属、雾中霓虹灯条；偏俯视、中景、冷色主调等"
                maxLength={4000}
              />
              <button
                type="submit"
                disabled={draftSaving || !draftName.trim() || !draftDesc.trim()}
                className="text-ui-mono w-full rounded bg-accent/15 py-1.5 text-[12px] text-accent disabled:cursor-not-allowed disabled:opacity-50 hover:bg-accent/25"
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
                        {d.ownerSessionId && s.stagingGroup?.draftStaging === "independent" && (
                          <p className="text-ui-mono mb-1 text-[9px] text-text-muted/80">
                            {d.ownerSessionId === id
                              ? "本会话"
                              : `来自：${d.ownerSessionTitle ?? "其他会话"}`}
                          </p>
                        )}
                        <p className="font-display line-clamp-2 text-sm text-text-primary">{d.name}</p>
                        <p className="text-ui-mono mt-0.5 line-clamp-4 text-[11px] leading-relaxed text-text-muted">
                          {d.description}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 border-t border-border/40 pt-2">
                          <button
                            type="button"
                            className="text-ui-mono text-[10px] text-accent hover:underline disabled:opacity-40"
                            disabled={exportOneId !== null}
                            onClick={async () => {
                              setExportOneId(d.tempId);
                              try {
                                await exportDraftToLibrary(d);
                                void qc.invalidateQueries({ queryKey: ["assets"] });
                              } finally {
                                setExportOneId(null);
                              }
                            }}
                          >
                            {exportOneId === d.tempId ? "导出中…" : "导出到库"}
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
                暂无暂存。在上方填写名称与「视觉描述」并加入后，会在此列表显示。
              </p>
            )}
            </div>
          </aside>
    );
    return { editor, drafts };
  }

  const stacked = makeSessionColumns(false, session);
  const split = makeSessionColumns(true, session);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
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
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden lg:hidden">
        {stacked.editor}
        {stacked.drafts}
      </div>
      <div className="hidden min-h-0 min-w-0 flex-1 lg:flex">
        <WorkspaceHorizontalSplit
          storageKey="layout:session-chat-drafts"
          leftDefaultSize={56}
          leftMinSize={38}
          rightMinSize={24}
          className="min-h-0 min-w-0 flex-1"
          left={split.editor}
          right={split.drafts}
        />
      </div>
    </div>
  );
}
