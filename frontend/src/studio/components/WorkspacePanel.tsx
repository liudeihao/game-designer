import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Save,
} from "lucide-react";
import { ApiHttpError, api } from "../../api";
import type { Conversation, WorkspaceSnapshot } from "../../types";
import { cn } from "@/lib/utils";
import { buildDocsTree, defaultDocsPath } from "../lib/docsTree";
import { normalizeDocsPath, parseDocsPath } from "../lib/docsPaths";
import { DocsExplorerTree } from "./DocsExplorerTree";
import {
  DocPathAnchor,
  SourceModeButton,
  useDocSourceMode,
  useFocusDocPath,
} from "./DocSource";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../components/ui/resizable";
import { Textarea } from "../../components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";

interface Props {
  workspace: WorkspaceSnapshot;
  projectId: string | null;
  projectName?: string;
  conversations?: Conversation[];
  currentConvId?: string | null;
  selectedPath: string | null;
  highlightedPath?: string | null;
  /** Open this docs path (from chat file refs). */
  focusPath?: string | null;
  onFocusPathConsumed?: () => void;
  onSelectPath: (path: string | null) => void;
  onWorkspace: (workspace: WorkspaceSnapshot) => void;
  /** Open a conversation's plan in the Plan view (may switch conversation). */
  onOpenPlan?: (conversationId: string) => void;
}

export function WorkspacePanel({
  workspace,
  projectId,
  projectName = "项目",
  conversations = [],
  currentConvId = null,
  selectedPath,
  highlightedPath,
  focusPath,
  onFocusPathConsumed,
  onSelectPath,
  onWorkspace,
  onOpenPlan,
}: Props) {
  const tree = useMemo(() => buildDocsTree(workspace.files), [workspace.files]);
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ docs: true, plans: true });
  const [draft, setDraft] = useState("");
  const [baseRev, setBaseRev] = useState<number | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const { sourceMode, toggleSource } = useDocSourceMode(selectedPath ?? undefined);
  const projectRef = useRef(projectId);

  const planConversations = useMemo(
    () => conversations.filter((c) => !!(c.plan_markdown && c.plan_markdown.trim())),
    [conversations],
  );

  const activePath = selectedPath;
  const dirty = activePath != null && draft !== (workspace.files[activePath] ?? "");

  useEffect(() => {
    if (projectRef.current === projectId) return;
    projectRef.current = projectId;
    setSelectedDir(null);
    setSaveError("");
  }, [projectId]);

  useEffect(() => {
    if (!focusPath) return;
    const target = parseDocsPath(focusPath);
    if (!target) return;
    onSelectPath(target);
    const parts = target.split("/");
    parts.pop();
    setSelectedDir(parts.join("/"));
  }, [focusPath, onSelectPath]);

  useFocusDocPath(focusPath, onFocusPathConsumed);

  useEffect(() => {
    if (selectedPath || !projectId) return;
    const fallback = defaultDocsPath(workspace.files);
    if (fallback) onSelectPath(fallback);
  }, [projectId, workspace.files, selectedPath, onSelectPath]);

  useEffect(() => {
    if (!projectId || !activePath) {
      setDraft("");
      setBaseRev(null);
      return;
    }

    const cached = workspace.files[activePath];
    const cachedRev = workspace.revs[activePath] ?? null;
    if (cached !== undefined) {
      setDraft(cached);
      setBaseRev(cachedRev);
    }

    let cancelled = false;
    setLoadingDoc(true);
    setSaveError("");
    api
      .readDocsFile(projectId, activePath)
      .then((doc) => {
        if (cancelled) return;
        setDraft(doc.content);
        setBaseRev(doc.rev ?? null);
        if (doc.content !== workspace.files[activePath]) {
          onWorkspace({
            files: { ...workspace.files, [activePath]: doc.content },
            revs: { ...workspace.revs, [activePath]: doc.rev ?? 0 },
          });
        }
      })
      .catch(() => {
        if (!cancelled && cached !== undefined) {
          setDraft(cached);
          setBaseRev(cachedRev);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDoc(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, activePath]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectFile = (path: string) => {
    setSaveError("");
    onSelectPath(path);
    const parts = path.split("/");
    parts.pop();
    setSelectedDir(parts.join("/"));
  };

  const selectDir = (dir: string) => {
    setSelectedDir(dir);
  };

  const saveDoc = async () => {
    if (!projectId || !activePath || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const result = await api.writeDocsFile(projectId, activePath, draft, baseRev);
      const next = result.workspace ?? {
        files: { ...workspace.files, [activePath]: draft },
        revs: { ...workspace.revs, [activePath]: result.rev ?? (baseRev ?? 0) + 1 },
      };
      onWorkspace(next);
      setBaseRev(result.rev ?? next.revs[activePath] ?? null);
    } catch (e) {
      if (e instanceof ApiHttpError && e.status === 409) {
        setSaveError("保存冲突：文件已被 Agent 或其他会话修改，正在刷新…");
        try {
          const snap = await api.getProject(projectId);
          onWorkspace(snap.workspace);
          const doc = await api.readDocsFile(projectId, activePath);
          setDraft(doc.content);
          setBaseRev(doc.rev ?? null);
        } catch {
          setSaveError("保存冲突，且无法刷新最新版本。");
        }
      } else {
        setSaveError(e instanceof Error ? e.message : "保存失败");
      }
    } finally {
      setSaving(false);
    }
  };

  const explorerEmpty = planConversations.length === 0 && tree.length === 0;
  const fileLabel = activePath ? activePath.split("/").pop() : null;
  const dirLabel = selectedDir && !activePath ? selectedDir : activePath?.includes("/")
    ? activePath.split("/").slice(0, -1).join("/")
    : null;

  const crumbSep = (
    <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" aria-hidden />
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full min-h-0 flex-col bg-background">
        <nav
          aria-label="面包屑"
          className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border/50 bg-muted/15 px-3 text-[12px]"
        >
          <button
            type="button"
            className={cn(
              "shrink-0 truncate rounded px-1 py-0.5 font-medium transition-colors",
              activePath || selectedDir
                ? "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                : "text-foreground",
            )}
            onClick={() => {
              setSelectedDir(null);
              const fallback = defaultDocsPath(workspace.files);
              onSelectPath(fallback);
            }}
            title={projectName}
          >
            {projectName}
          </button>
          {dirLabel && (
            <>
              {crumbSep}
              <span className="min-w-0 truncate px-1 text-muted-foreground">{dirLabel}</span>
            </>
          )}
          {fileLabel && (
            <>
              {crumbSep}
              <span className="min-w-0 truncate px-1 font-medium text-foreground">{fileLabel}</span>
            </>
          )}
        </nav>

        <ResizablePanelGroup orientation="horizontal" className="min-h-0 min-w-0 flex-1">
          <ResizablePanel id="doc-content" defaultSize="68%" minSize="40%">
            <div className="flex h-full min-h-0 min-w-0 flex-col">
              {!activePath ? (
                <div className="flex h-full min-h-0 flex-col items-center justify-center px-6 text-center panel-fade-in">
                  <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted">
                    <FolderOpen className="size-5 text-muted-foreground" />
                  </div>
                  <h3 className="text-[14px] font-semibold tracking-tight">选择文档</h3>
                  <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-muted-foreground">
                    从右侧选择 Markdown 文件进行预览或编辑。
                  </p>
                </div>
              ) : (
                <DocPathAnchor path={activePath} className="flex min-h-0 flex-1 flex-col">
                  <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 px-3">
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted-foreground">
                      {normalizeDocsPath(activePath)}
                    </span>
                    {loadingDoc && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
                    <SourceModeButton active={sourceMode} onClick={toggleSource} disabled={loadingDoc} />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant={dirty ? "default" : "outline"}
                          className="h-7 gap-1 px-2 text-[12px]"
                          disabled={!dirty || saving || loadingDoc}
                          onClick={saveDoc}
                        >
                          {saving ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Save className="size-3.5" />
                          )}
                          保存
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>写入 docs 并校验版本 (rev)</TooltipContent>
                    </Tooltip>
                  </div>

                  {saveError && (
                    <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                      {saveError}
                    </div>
                  )}

                  <div className="min-h-0 flex-1 overflow-y-auto p-4 panel-fade-in">
                    {sourceMode ? (
                      <Textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className="min-h-[min(70vh,40rem)] resize-y font-mono text-[13px] leading-relaxed"
                        spellCheck={false}
                        disabled={loadingDoc}
                      />
                    ) : (
                      <div className="ws-prose max-w-none">
                        <Markdown remarkPlugins={[remarkGfm]}>{draft || "_（空文档）_"}</Markdown>
                      </div>
                    )}
                  </div>
                </DocPathAnchor>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel id="doc-explorer" defaultSize="32%" minSize="18%" maxSize="50%">
            <aside className="flex h-full min-h-0 flex-col bg-muted/10">
              <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/50 px-2">
                <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
                  文档
                </span>
              </div>

              <nav className="min-h-0 flex-1 overflow-y-auto px-1 py-1.5 font-mono">
                {explorerEmpty ? (
                  <div className="flex h-full min-h-[160px] flex-col items-center justify-center px-3 text-center font-sans">
                    <Folder className="mb-2 size-5 text-muted-foreground/50" />
                    <p className="text-[12px] leading-relaxed text-muted-foreground">工作区为空</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">
                      对话产出后会出现在这里
                    </p>
                  </div>
                ) : (
                  <>
                    {planConversations.length > 0 && (
                      <div className="mb-1">
                        <button
                          type="button"
                          onClick={() => toggleExpanded("plans")}
                          className="flex w-full items-center gap-0.5 rounded-sm px-0.5 py-1 text-left text-[12px] font-sans font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        >
                          {expanded.plans !== false ? (
                            <ChevronDown className="size-3 shrink-0" />
                          ) : (
                            <ChevronRight className="size-3 shrink-0" />
                          )}
                          <FolderOpen className="size-3 shrink-0 text-violet-600/80 dark:text-violet-400/80" />
                          <span className="truncate">plan</span>
                          <Badge variant="secondary" className="ml-auto h-4 min-w-4 px-1 text-[10px]">
                            {planConversations.length}
                          </Badge>
                        </button>
                        {expanded.plans !== false && (
                          <div className="ml-2 border-l border-border/40">
                            {planConversations.map((c) => {
                              const active = c.id === currentConvId;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => onOpenPlan?.(c.id)}
                                  className={cn(
                                    "mb-px flex w-full items-center gap-1 rounded-sm py-1 pl-2 pr-1.5 text-left text-[12.5px] transition-colors",
                                    active
                                      ? "bg-primary/12 font-medium text-foreground"
                                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                                  )}
                                  title={c.title}
                                >
                                  <FileText className="size-3 shrink-0 text-violet-600/80 dark:text-violet-400/70" />
                                  <span className="min-w-0 flex-1 truncate font-sans">
                                    {c.title || "未命名 plan"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {tree.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => toggleExpanded("docs")}
                          className="flex w-full items-center gap-0.5 rounded-sm px-0.5 py-1 text-left text-[12px] font-sans font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        >
                          {expanded.docs !== false ? (
                            <ChevronDown className="size-3 shrink-0" />
                          ) : (
                            <ChevronRight className="size-3 shrink-0" />
                          )}
                          <FolderOpen className="size-3 shrink-0 text-amber-600/80 dark:text-amber-400/80" />
                          <span className="truncate">设计文档</span>
                        </button>
                        {expanded.docs !== false && (
                          <div className="ml-1.5 border-l border-border/40 pl-0.5">
                            <DocsExplorerTree
                              nodes={tree}
                              expanded={expanded}
                              onToggle={toggleExpanded}
                              selectedFilePath={activePath}
                              selectedDir={selectedDir}
                              highlightedPath={highlightedPath}
                              onSelectDir={selectDir}
                              onSelectFile={selectFile}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </nav>
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  );
}
