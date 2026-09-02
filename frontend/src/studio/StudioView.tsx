import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api, formatApiError, normalizeWorkspace, sendChat, sendResume } from "../api";
import type {
  ActivityEntry,
  AnswerValue,
  ChatMessage,
  ContextUsage,
  Conversation,
  ConversationFolder,
  ConversationMode,
  LiveTurn,
  PendingInterrupt,
  PendingQuestion,
  PendingSuggestMode,
  PlanStatus,
  ProjectMeta,
  StreamFrame,
  RuleOperation,
  RuleProposalPart,
  RuleScope,
  RuntimeEvent,
  UsageScopes,
  WorkspaceSnapshot,
} from "../types";
import { emptyUsageScopes, isPendingQuestion, isPendingSuggestMode, isPendingToolPermission, normalizeMode, planQuestionsFromLastMessage, suggestedModeLabel } from "../types";
import {
  applyActivityToTrace,
  emptyLiveTurn,
  liveTurnToMessage,
  normalizeMessages,
  resolveUserChoiceInLive,
  resolveUserChoiceInMessages,
} from "./streamUtils";
import { applyFrame, emptyAgentRun } from "./applyFrame";
import { attachEventsToMessages, hydratePendingChoice } from "./lib/eventsColumn";
import { choiceAnswersFromRecord } from "./components/UserChoiceInline";
import { WorkspacePanel } from "./components/WorkspacePanel";
import { ChatPanel } from "./components/ChatPanel";
import { ConversationList } from "./components/ConversationList";
import { Dialog, type DialogConfig } from "../components/Dialog";
import { PlanPanel } from "./components/PlanPanel";
import { RightViewSwitcher, type RightView } from "./components/RightViewSwitcher";
import { parseDocsPath } from "./lib/docsPaths";
import { WorkspaceSettingsDialog } from "../components/SettingsModal";
import { TopBar } from "./components/TopBar";
import { Button } from "../components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable";
import {
  activityToDocPath,
  loadPanelFollowMode,
  type PanelFollowMode,
} from "./panelFollow";
import {
  loadRightView,
  loadWidth,
  persistPanelLayouts,
  persistRightView,
  pxToPercent,
} from "./utils/layoutStorage";

const EMPTY_WORKSPACE: WorkspaceSnapshot = { files: {}, revs: {} };

function isUnusedConversationTitle(title: string | undefined): boolean {
  const t = (title ?? "").trim();
  return t === "" || t === "新对话";
}

interface LocationState {
  startMode?: ConversationMode;
}

interface Props {
  onLlmConfiguredChange?: (configured: boolean) => void;
}

export function StudioView({ onLlmConfiguredChange }: Props) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const startModeRef = useRef<ConversationMode | undefined>(
    (() => {
      const state = location.state as LocationState | null;
      if (!state || !("startMode" in state)) return undefined;
      return normalizeMode(state.startMode);
    })(),
  );

  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [folders, setFolders] = useState<ConversationFolder[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(EMPTY_WORKSPACE);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<PendingInterrupt | null>(null);
  const [planMarkdown, setPlanMarkdown] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [planStatus, setPlanStatus] = useState<PlanStatus>("drafting");
  const [workflowMode, setWorkflowMode] = useState<ConversationMode>(null);
  const [rightView, setRightView] = useState<RightView>(loadRightView);
  const [selectedModel, setSelectedModel] = useState("");
  const [executePlanStarting, setExecutePlanStarting] = useState(false);
  /** Conversation ids with an in-flight SSE (parallel tasks). */
  const [runningIds, setRunningIds] = useState<string[]>([]);
  const [stoppingIds, setStoppingIds] = useState<string[]>([]);
  const [liveTurn, setLiveTurn] = useState<LiveTurn | null>(null);
  const [selectedDocPath, setSelectedDocPath] = useState<string | null>(null);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [input, setInput] = useState("");
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [panelFollowMode, setPanelFollowMode] = useState<PanelFollowMode>(loadPanelFollowMode);
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false);
  const [highlightedDocPath, setHighlightedDocPath] = useState<string | null>(null);
  /** Designer-view focus target from chat file_refs (docs relative path). */
  const [docFocusPath, setDocFocusPath] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageScopes>(emptyUsageScopes());
  /** Per-conversation SSE readings. A single value leaked across session switches. */
  const [liveContextById, setLiveContextById] = useState<Record<string, ContextUsage>>({});
  const rightPct = pxToPercent(loadWidth("gd.rightWidth", 560), 36);
  const midPct = Math.max(20, 100 - rightPct);
  const defaultLayout = {
    chat: midPct,
    right: rightPct,
  };

  const currentId = projectId ?? null;

  const liveTurnRef = useRef<LiveTurn>(emptyLiveTurn());
  const messagesRef = useRef<ChatMessage[]>([]);
  const streamActivityRef = useRef<ActivityEntry[]>([]);
  type ConvStream = {
    abort: AbortController;
    liveTurn: LiveTurn;
    activity: ActivityEntry[];
    run: ReturnType<typeof emptyAgentRun>;
    stopping: boolean;
    forceTimer?: ReturnType<typeof setTimeout>;
  };
  const streamsRef = useRef(new Map<string, ConvStream>());
  const activeConvIdRef = useRef<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const loadSeqRef = useRef(0);
  const creatingConvRef = useRef(false);

  const running = !!currentConvId && runningIds.includes(currentConvId);
  const stopping = !!currentConvId && stoppingIds.includes(currentConvId);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    activeConvIdRef.current = currentConvId;
  }, [currentConvId]);

  const markRunning = useCallback((cid: string, on: boolean) => {
    setRunningIds((prev) => {
      const set = new Set(prev);
      if (on) set.add(cid);
      else set.delete(cid);
      return [...set];
    });
  }, []);

  const beginStream = useCallback(
    (cid: string) => {
      const prev = streamsRef.current.get(cid);
      if (prev?.forceTimer) clearTimeout(prev.forceTimer);
      prev?.abort.abort();
      const ac = new AbortController();
      streamsRef.current.set(cid, {
        abort: ac,
        liveTurn: emptyLiveTurn(),
        activity: [],
        run: { ...emptyAgentRun(cid), messages: [...messagesRef.current] },
        stopping: false,
      });
      markRunning(cid, true);
      setStoppingIds((prevIds) => prevIds.filter((id) => id !== cid));
      return ac.signal;
    },
    [markRunning],
  );

  const endStream = useCallback(
    (cid: string) => {
      const s = streamsRef.current.get(cid);
      if (s?.forceTimer) clearTimeout(s.forceTimer);
      streamsRef.current.delete(cid);
      markRunning(cid, false);
      setStoppingIds((prev) => prev.filter((id) => id !== cid));
    },
    [markRunning],
  );

  const persistLayouts = persistPanelLayouts;

  const refreshProjects = useCallback(async () => {
    const ps = await api.listProjects();
    setProjects(ps);
    return ps;
  }, []);

  /** Context limits are model-specific, so drop the streamed reading on switch. */
  const changeModel = useCallback((modelKey: string) => {
    setSelectedModel(modelKey);
    const cid = activeConvIdRef.current;
    if (!cid) return;
    setLiveContextById((prev) => {
      if (!(cid in prev)) return prev;
      const next = { ...prev };
      delete next[cid];
      return next;
    });
  }, []);

  const resetChatState = () => {
    setMessages([]);
    setActivity([]);
    setPending(null);
    setPlanMarkdown("");
    setLiveTurn(null);
    setErrorMsg("");
    liveTurnRef.current = emptyLiveTurn();
    streamActivityRef.current = [];
  };

  const selectConversation = useCallback(async (cid: string) => {
    setCurrentConvId(cid);
    resetChatState();
    setSelectedDocPath(null);
    const snap = await api.getConversation(cid);
    const mode = normalizeMode(snap.conversation.mode);
    setWorkflowMode(mode);
    setWorkspace(snap.workspace);
    setActivity(snap.activity);
    setMessages(
      hydratePendingChoice(
        attachEventsToMessages(normalizeMessages(snap.messages), snap.events),
        snap.pending,
      ),
    );
    setPending(snap.pending);
    setPlanMarkdown(snap.plan_markdown ?? "");
    setPlanTitle(snap.plan_title ?? "");
    setPlanStatus(snap.plan_status ?? "drafting");
    setUsage(snap.usage ?? emptyUsageScopes());
    const nextView: RightView = mode === "plan" ? "plan" : "workspace";
    setRightView(nextView);
    persistRightView(nextView);
    // Resume live bubble if this conversation is still streaming in the background.
    const session = streamsRef.current.get(cid);
    if (session) {
      liveTurnRef.current = session.liveTurn;
      streamActivityRef.current = session.activity;
      setLiveTurn({ ...session.liveTurn });
      if (session.activity.length) {
        setActivity(session.activity);
      }
    }
  }, []);

  const loadProject = useCallback(async (id: string) => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setLoadError("");
    resetChatState();
    setCurrentConvId(null);
    setSelectedDocPath(null);
    setWorkspace(EMPTY_WORKSPACE);
    setUsage(emptyUsageScopes());
    setLiveContextById({});
    try {
      const snap = await api.getProject(id);
      if (seq !== loadSeqRef.current) return;
      setWorkspace(snap.workspace);
      setConversations(snap.conversations);
      try {
        const folderList = await api.listFolders(id);
        if (seq !== loadSeqRef.current) return;
        setFolders(folderList);
      } catch {
        setFolders([]);
      }
      if (snap.usage) setUsage(snap.usage);

      const preferredMode = startModeRef.current;
      startModeRef.current = undefined;
      window.history.replaceState({}, document.title);

      if (snap.conversations.length) {
        await selectConversation(snap.conversations[0].id);
      } else {
        const mode: ConversationMode = preferredMode === undefined ? "plan" : preferredMode;
        try {
          const c = await api.createConversation(id, {
            mode,
            title: "新对话",
          });
          if (seq !== loadSeqRef.current) return;
          setConversations([c]);
          setCurrentConvId(c.id);
          setWorkflowMode(mode);
          const nextView: RightView = mode === "plan" ? "plan" : "workspace";
          setRightView(nextView);
          persistRightView(nextView);
        } catch {
          // StrictMode / 并发加载可能已创建首个对话，回读即可
          const again = await api.getProject(id);
          if (seq !== loadSeqRef.current) return;
          if (again.conversations.length) {
            setConversations(again.conversations);
            await selectConversation(again.conversations[0].id);
          } else {
            throw new Error("无法创建对话");
          }
        }
      }
    } catch {
      if (seq !== loadSeqRef.current) return;
      setLoadError("项目不存在或加载失败");
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [selectConversation]);

  useEffect(() => {
    api.health().then((h) => {
      setLlmConfigured(h.llm_configured);
      onLlmConfiguredChange?.(h.llm_configured);
    });
    refreshProjects();
  }, [refreshProjects, onLlmConfiguredChange]);

  useEffect(() => {
    if (projectId) loadProject(projectId);
  }, [projectId, loadProject]);

  const refreshConversations = useCallback(async () => {
    if (!currentId) return;
    const data = await api.listConversationsAndFolders(currentId);
    setConversations(data.conversations);
    setFolders(data.folders ?? []);
  }, [currentId]);

  const refreshWorkspace = useCallback(async () => {
    if (!currentId) return;
    try {
      const snap = await api.getProject(currentId);
      setWorkspace(snap.workspace);
    } catch {
      /* keep local snapshot */
    }
  }, [currentId]);

  const applyActivityFocus = useCallback((entry: ActivityEntry) => {
    if (panelFollowMode === "off") return;
    const docPath = activityToDocPath(entry);
    if (!docPath) return;
    if (panelFollowMode === "follow") {
      setSelectedDocPath(docPath);
      setDocFocusPath(docPath);
      setRightView("workspace");
      persistRightView("workspace");
    } else {
      setHighlightedDocPath(docPath);
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightedDocPath(null), 3000);
    }
  }, [panelFollowMode]);

  const selectProject = (id: string) => {
    navigate(`/project/${id}`);
  };

  const createProject = () => {
    navigate("/new");
  };

  const renameProject = (id: string) => {
    const proj = projects.find((p) => p.id === id);
    setDialog({
      title: "重命名项目",
      inputLabel: "项目名称",
      defaultValue: proj?.name ?? "",
      confirmLabel: "保存",
      onConfirm: async (name) => {
        await api.renameProject(id, name.trim() || proj?.name || "未命名游戏");
        await refreshProjects();
      },
    });
  };

  const deleteProject = (id: string) => {
    const name = projects.find((p) => p.id === id)?.name ?? "该项目";
    setDialog({
      title: "删除项目",
      message: `确定删除「${name}」？其所有对话与游戏设计资产都将被删除，此操作不可撤销。`,
      confirmLabel: "删除",
      danger: true,
      onConfirm: async () => {
        await api.deleteProject(id);
        if (currentId === id) {
          navigate("/");
        } else {
          await refreshProjects();
        }
      },
    });
  };

  const changeRightView = (view: RightView) => {
    setRightView(view);
    persistRightView(view);
  };

  const openFileFromChat = useCallback((path: string) => {
    const target = parseDocsPath(path);
    if (!target) return;
    setRightView("workspace");
    persistRightView("workspace");
    setHighlightedDocPath(null);
    setSelectedDocPath(target);
    setDocFocusPath(target);
  }, []);

  const openPlanFromExplorer = async (conversationId: string) => {
    if (conversationId !== currentConvId) {
      await selectConversation(conversationId);
    }
    changeRightView("plan");
  };

  const spawnConversation = async (
    mode: ConversationMode = "plan",
    folderId?: string | null,
    opts?: { force?: boolean },
  ) => {
    if (!currentId || creatingConvRef.current) return;

    if (!opts?.force) {
      const current = conversations.find((c) => c.id === currentConvId);
      const currentUnused = !!current && messages.length === 0 && !running;

      if (currentUnused) {
        composerRef.current?.focus();
        return;
      }

      const unused =
        conversations.find((c) => {
          if (!isUnusedConversationTitle(c.title)) return false;
          if (folderId) return (c.folder_id ?? null) === folderId;
          return true;
        }) ?? conversations.find((c) => isUnusedConversationTitle(c.title));

      if (unused) {
        if (unused.id !== currentConvId) await selectConversation(unused.id);
        else composerRef.current?.focus();
        return;
      }
    }

    creatingConvRef.current = true;
    try {
      const c = await api.createConversation(currentId, {
        mode,
        title: "新对话",
        folder_id: folderId ?? null,
      });
      setConversations((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
      await selectConversation(c.id);
    } finally {
      creatingConvRef.current = false;
    }
  };

  const createConversation = async (
    mode: ConversationMode = "plan",
    folderId?: string | null,
  ) => {
    if (!currentId) return;
    try {
      await spawnConversation(mode, folderId);
    } catch (e) {
      reportError(formatApiError(e, "无法创建对话"));
    }
  };

  const createFolder = () => {
    if (!currentId) return;
    setDialog({
      title: "新建文件夹",
      inputLabel: "文件夹名称",
      defaultValue: "未命名文件夹",
      confirmLabel: "创建",
      onConfirm: async (name) => {
        const f = await api.createFolder(currentId, name.trim() || "未命名文件夹");
        setFolders((prev) => [...prev, f].sort((a, b) => a.name.localeCompare(b.name, "zh")));
      },
    });
  };

  const renameFolder = (f: ConversationFolder) => {
    setDialog({
      title: "重命名文件夹",
      inputLabel: "文件夹名称",
      defaultValue: f.name,
      confirmLabel: "保存",
      onConfirm: async (name) => {
        const updated = await api.renameFolder(f.id, name.trim() || f.name);
        setFolders((prev) =>
          prev
            .map((x) => (x.id === updated.id ? updated : x))
            .sort((a, b) => a.name.localeCompare(b.name, "zh")),
        );
      },
    });
  };

  const deleteFolder = (fid: string) => {
    const name = folders.find((f) => f.id === fid)?.name ?? "该文件夹";
    setDialog({
      title: "删除文件夹",
      message: `确定删除文件夹「${name}」？其中的对话会移到未分组，不会被删除。`,
      confirmLabel: "删除",
      danger: true,
      onConfirm: async () => {
        await api.deleteFolder(fid);
        await refreshConversations();
      },
    });
  };

  const moveConversation = async (c: Conversation, folderId: string | null) => {
    const updated = await api.moveConversation(c.id, folderId);
    setConversations((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
  };

  const enterPlanPhase = async () => {
    if (!currentConvId || running) return;
    try {
      const { conversation, plan_markdown, plan_title, fresh } =
        await api.enterPlan(currentConvId);
      setWorkflowMode("plan");
      setPlanMarkdown(plan_markdown ?? "");
      setPlanTitle(plan_title ?? "");
      setPlanStatus(fresh ? "drafting" : "ready");
      changeRightView("plan");
      setConversations((prev) =>
        prev.map((c) => (c.id === conversation.id ? { ...c, ...conversation } : c)),
      );
    } catch (e) {
      reportError(formatApiError(e, "无法进入 Plan"));
    }
  };

  const leavePlanPhase = async () => {
    if (!currentConvId || running) return;
    try {
      const { conversation } = await api.leavePlan(currentConvId);
      setWorkflowMode(null);
      changeRightView("workspace");
      setConversations((prev) =>
        prev.map((c) => (c.id === conversation.id ? { ...c, ...conversation } : c)),
      );
    } catch (e) {
      reportError(formatApiError(e, "无法退出 Plan"));
    }
  };

  const enterAskPhase = async () => {
    if (!currentConvId || running) return;
    try {
      const { conversation } = await api.enterAsk(currentConvId);
      setWorkflowMode("ask");
      setConversations((prev) =>
        prev.map((c) => (c.id === conversation.id ? { ...c, ...conversation } : c)),
      );
    } catch (e) {
      reportError(formatApiError(e, "无法进入 Ask"));
    }
  };

  const leaveAskPhase = async () => {
    if (!currentConvId || running) return;
    try {
      const { conversation } = await api.leaveAsk(currentConvId);
      setWorkflowMode(null);
      setConversations((prev) =>
        prev.map((c) => (c.id === conversation.id ? { ...c, ...conversation } : c)),
      );
    } catch (e) {
      reportError(formatApiError(e, "无法退出 Ask"));
    }
  };

  const renameConversation = (c: Conversation) => {
    setDialog({
      title: "重命名对话",
      inputLabel: "对话名称",
      defaultValue: c.title,
      confirmLabel: "保存",
      onConfirm: async (title) => {
        await api.renameConversation(c.id, title.trim() || c.title);
        refreshConversations();
      },
    });
  };

  const deleteConversation = (cid: string) => {
    const name = conversations.find((c) => c.id === cid)?.title ?? "该对话";
    setDialog({
      title: "删除对话",
      message: `确定删除对话「${name}」？此操作不可撤销（游戏设计资产不受影响）。`,
      confirmLabel: "删除",
      danger: true,
      onConfirm: async () => {
        streamsRef.current.get(cid)?.abort.abort();
        endStream(cid);
        setLiveContextById((prev) => {
          if (!(cid in prev)) return prev;
          const next = { ...prev };
          delete next[cid];
          return next;
        });
        await api.deleteConversation(cid);
        if (currentId) {
          const data = await api.listConversationsAndFolders(currentId);
          setConversations(data.conversations);
          setFolders(data.folders ?? []);
          if (currentConvId === cid) {
            if (data.conversations.length) selectConversation(data.conversations[0].id);
            else await spawnConversation(null, undefined, { force: true });
          }
        }
      },
    });
  };

  const handlers = (cid: string, finalize: () => void) => {
    const isActive = () => activeConvIdRef.current === cid;
    const sessionOf = () => streamsRef.current.get(cid);

    const commitFrame = (frame: StreamFrame) => {
      const s = sessionOf();
      if (!s) return;
      if (frame.type === "done") {
        // Assemble outside setState: StrictMode replays updaters, and folding the
        // live turn in twice would drop the bubble the second time around.
        const base = isActive() ? messagesRef.current : s.run.messages;
        const assembled = applyFrame({ ...s.run, messages: base }, frame);
        s.run = assembled;
        s.liveTurn = emptyLiveTurn();
        if (isActive()) {
          messagesRef.current = assembled.messages;
          setMessages(assembled.messages);
          liveTurnRef.current = emptyLiveTurn();
          setLiveTurn(null);
          setPending(assembled.pending ?? null);
        }
        return;
      }
      const next = applyFrame(
        { ...s.run, messages: isActive() ? messagesRef.current : s.run.messages },
        frame,
      );
      s.run = next;
      s.liveTurn = next.live ?? emptyLiveTurn();
      if (!isActive()) return;
      liveTurnRef.current = s.liveTurn;
      if (next.live) setLiveTurn({ ...next.live });
      else setLiveTurn(null);
      if (frame.type === "pending") setPending(next.pending ?? null);
    };

    return {
      onFrame: commitFrame,
      // Backstop: a stream can end without done/error/abort (proxy drop, or an
      // abort before the response headers land) and would otherwise leave the
      // conversation marked running forever.
      onClose: () => endStream(cid),
      onActivity: (e: ActivityEntry) => {
        const s = sessionOf();
        if (!s) return;
        s.activity.push(e);
        if (!isActive()) return;
        streamActivityRef.current = s.activity;
        setActivity((prev) => [...prev, e]);
        if (workflowMode !== "plan") {
          applyActivityFocus(e);
          if (activityToDocPath(e) && currentId) {
            void refreshWorkspace();
          }
        }
      },
      onPlan: (md: string, extra?: { progress?: unknown; title?: string }) => {
        if (!md) return;
        const title = extra?.title ?? "";
        setConversations((prev) =>
          prev.map((c) =>
            c.id === cid
              ? { ...c, plan_markdown: md, plan_title: title || c.plan_title }
              : c,
          ),
        );
        if (!isActive()) return;
        setPlanMarkdown(md);
        setPlanStatus("ready");
        if (title) setPlanTitle(title);
        if (workflowMode === "plan") {
          setRightView("plan");
          persistRightView("plan");
        }
      },
      onAbort: () => {
        const s = sessionOf();
        const turn = s?.liveTurn ?? liveTurnRef.current;
        if (isActive()) {
          const frozen = liveTurnToMessage(turn, "（已停止）");
          if (frozen) setMessages((prev) => [...prev, frozen]);
          liveTurnRef.current = emptyLiveTurn();
          streamActivityRef.current = [];
          setLiveTurn(null);
        }
        endStream(cid);
        finalize();
      },
      onUsage: (u: UsageScopes) => {
        if (u.context) {
          setLiveContextById((prev) => ({ ...prev, [cid]: u.context! }));
        }
        if (!isActive()) return;
        setUsage(u);
      },
      onDone: (p: {
        workspace?: WorkspaceSnapshot;
        gdd?: WorkspaceSnapshot;
        activity?: ActivityEntry[];
        events?: RuntimeEvent[];
        messages?: ChatMessage[];
        pending: PendingInterrupt | null;
        plan_markdown?: string;
        plan_title?: string;
        plan_status?: PlanStatus;
        kind?: string;
        mode?: string;
        conversation?: Conversation;
        usage?: UsageScopes;
        flush_error?: { message?: string };
      }) => {
        const s = sessionOf();
        const buffered = s?.activity ?? [];
        setWorkspace(normalizeWorkspace(p));
        if (p.usage?.context) {
          setLiveContextById((prev) => ({ ...prev, [cid]: p.usage!.context! }));
        }
        if (p.usage && isActive()) setUsage(p.usage);
        if (p.conversation) {
          setConversations((prev) =>
            prev.map((c) => (c.id === p.conversation!.id ? { ...c, ...p.conversation! } : c)),
          );
        } else if (p.plan_markdown !== undefined && p.plan_markdown.trim()) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === cid
                ? { ...c, plan_markdown: p.plan_markdown, plan_title: p.plan_title || c.plan_title }
                : c,
            ),
          );
        }

        if (isActive()) {
          const finalActivity = (p.activity && p.activity.length) ? p.activity : buffered;
          setActivity(finalActivity);
          setPending(p.pending);
          if (p.plan_markdown?.trim()) {
            setPlanMarkdown(p.plan_markdown);
            if (p.plan_title) setPlanTitle(p.plan_title);
            if (p.plan_status) setPlanStatus(p.plan_status);
          }
          const nextMode = normalizeMode(p.mode ?? p.kind ?? workflowMode);
          setWorkflowMode(nextMode);
          liveTurnRef.current = emptyLiveTurn();
          streamActivityRef.current = [];
          setLiveTurn(null);
          if (p.flush_error?.message) setErrorMsg(p.flush_error.message);
        }

        endStream(cid);
        finalize();
      },
      onError: (m: string) => {
        const s = sessionOf();
        const entry: ActivityEntry = { ts: "", agent: "系统", kind: "error", message: m };
        if (s) {
          s.activity.push(entry);
          const live = applyActivityToTrace(s.liveTurn, entry);
          s.liveTurn = live;
          if (s.run.live) s.run = { ...s.run, live, status: "error" };
        }
        if (isActive()) {
          streamActivityRef.current.push(entry);
          setActivity((prev) => [...prev, entry]);
          setErrorMsg(m);
          if (s) {
            liveTurnRef.current = s.liveTurn;
            setLiveTurn({ ...s.liveTurn });
          }
        }
        endStream(cid);
      },
    };
  };

  const reportError = (m: string, cid?: string | null) => {
    const target = cid ?? currentConvId;
    const entry: ActivityEntry = { ts: "", agent: "系统", kind: "error", message: m };
    if (!target || activeConvIdRef.current === target) {
      streamActivityRef.current.push(entry);
      setActivity((prev) => [...prev, entry]);
      liveTurnRef.current = applyActivityToTrace(liveTurnRef.current, entry);
      setLiveTurn({ ...liveTurnRef.current });
      setErrorMsg(m);
    }
    if (target) endStream(target);
  };

  const stopGeneration = () => {
    if (!currentConvId) return;
    const cid = currentConvId;
    const s = streamsRef.current.get(cid);
    if (!s) return;
    if (s.stopping) {
      s.abort.abort();
      return;
    }
    s.stopping = true;
    setStoppingIds((prev) => (prev.includes(cid) ? prev : [...prev, cid]));
    s.forceTimer = setTimeout(() => {
      streamsRef.current.get(cid)?.abort.abort();
    }, 20_000);
    void api.stopRun(cid).then(
      () => undefined,
      () => {
        streamsRef.current.get(cid)?.abort.abort();
      },
    );
  };

  const afterRun = () => {
    refreshProjects();
    refreshConversations();
  };

  const send = async () => {
    if (!currentConvId || !input.trim() || running) return;
    const instruction = input.trim();
    setInput("");
    setErrorMsg("");
    streamActivityRef.current = [];

    const dismissAnswers = [{ prompt: "状态", answer: "已用输入框继续" }];
    if (isPendingQuestion(pending) || isPendingSuggestMode(pending) || isPendingToolPermission(pending)) {
      setMessages((prev) => [
        ...resolveUserChoiceInMessages(prev, { status: "dismissed", answers: dismissAnswers }),
        { id: `human-${Date.now()}`, role: "human", content: instruction },
      ]);
      setPending(null);
      liveTurnRef.current = emptyLiveTurn();
      setLiveTurn(emptyLiveTurn());
      try {
        if (isPendingQuestion(pending)) {
          await sendResume(
            currentConvId,
            { action: "skip", message: instruction },
            handlers(currentConvId, afterRun),
            { signal: beginStream(currentConvId) },
          );
        } else if (isPendingToolPermission(pending)) {
          const answers: Record<string, { action: string; comment?: string }> = {};
          for (const call of pending.calls) {
            answers[call.id] = { action: "comment", comment: instruction };
          }
          await sendResume(
            currentConvId,
            answers,
            handlers(currentConvId, afterRun),
            { signal: beginStream(currentConvId) },
          );
        } else {
          await sendResume(currentConvId, { action: "dismiss" }, {
            onError: (m) => reportError(m),
          });
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== currentConvId) return c;
              if (c.title && c.title !== "新对话") return c;
              return { ...c, title: instruction.split("\n")[0].slice(0, 20) || c.title };
            }),
          );
          await sendChat(
            currentConvId,
            instruction,
            handlers(currentConvId, afterRun),
            { ...(selectedModel ? { model: selectedModel } : {}), signal: beginStream(currentConvId) },
          );
        }
      } catch (e) {
        reportError(formatApiError(e, "发送失败"));
      }
      return;
    }

    setMessages((prev) => [...prev, { id: `human-${Date.now()}`, role: "human", content: instruction }]);
    // Optimistic title update so the sidebar doesn't look like a "new" chat.
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== currentConvId) return c;
        if (c.title && c.title !== "新对话") return c;
        return { ...c, title: instruction.split("\n")[0].slice(0, 20) || c.title };
      }),
    );
    liveTurnRef.current = emptyLiveTurn();
    setLiveTurn(emptyLiveTurn());
    try {
      await sendChat(
        currentConvId,
        instruction,
        handlers(currentConvId, afterRun),
        { ...(selectedModel ? { model: selectedModel } : {}), signal: beginStream(currentConvId) },
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      reportError(formatApiError(e, "发送失败"));
    }
  };

  const submitAnswers = async (answers: Record<string, AnswerValue>, qPending: PendingQuestion) => {
    if (!currentConvId) return;
    const answerItems = choiceAnswersFromRecord(qPending.questions, answers);
    setMessages((prev) =>
      resolveUserChoiceInMessages(prev, { status: "answered", answers: answerItems }),
    );
    if (liveTurnRef.current.choices?.length) {
      const frozen = resolveUserChoiceInLive(liveTurnRef.current, {
        status: "answered",
        answers: answerItems,
      });
      liveTurnRef.current = frozen;
      setLiveTurn({ ...frozen });
    }
    setPending(null);
    setErrorMsg("");
    streamActivityRef.current = [];
    liveTurnRef.current = emptyLiveTurn();
    setLiveTurn(emptyLiveTurn());
    try {
      await sendResume(
        currentConvId,
        { answers, questions: qPending.questions },
        handlers(currentConvId, afterRun),
        { signal: beginStream(currentConvId) },
      );
    } catch (e) {
      reportError(formatApiError(e, "回答提交失败"));
    }
  };

  const submitPermission = async (
    answers: Record<string, { action: "accept" | "reject" | "comment"; comment?: string }>,
  ) => {
    if (!currentConvId) return;
    setPending(null);
    setErrorMsg("");
    streamActivityRef.current = [];
    liveTurnRef.current = emptyLiveTurn();
    setLiveTurn(emptyLiveTurn());
    try {
      await sendResume(
        currentConvId,
        answers,
        handlers(currentConvId, afterRun),
        { signal: beginStream(currentConvId) },
      );
    } catch (e) {
      reportError(formatApiError(e, "提交 Tool Permission 失败"));
    }
  };

  const sendInstruction = async (conversationId: string, instruction: string) => {
    setErrorMsg("");
    streamActivityRef.current = [];
    setMessages((prev) => [...prev, { id: `human-${Date.now()}`, role: "human", content: instruction }]);
    liveTurnRef.current = emptyLiveTurn();
    setLiveTurn(emptyLiveTurn());
    await sendChat(
        conversationId,
        instruction,
        handlers(conversationId, afterRun),
        { ...(selectedModel ? { model: selectedModel } : {}), signal: beginStream(conversationId) },
      );
  };

  const executePlanFromPanel = async () => {
    if (!currentConvId || running || executePlanStarting) return;
    const cid = currentConvId;
    setExecutePlanStarting(true);
    setErrorMsg("");
    streamActivityRef.current = [];
    liveTurnRef.current = emptyLiveTurn();
    setLiveTurn(emptyLiveTurn());
    setWorkflowMode(null);
    setPlanStatus("executed");
    changeRightView("workspace");
    setConversations((prev) =>
      prev.map((c) => (c.id === cid ? { ...c, mode: null } : c)),
    );
    try {
      await api.executePlan(cid, handlers(cid, afterRun), {
        signal: beginStream(cid),
      });
    } catch (e) {
      reportError(formatApiError(e, "无法执行计划"));
    } finally {
      setExecutePlanStarting(false);
    }
  };

  const acceptSuggestMode = async (suggested: PendingSuggestMode) => {
    if (!currentConvId) return;
    const dest = suggested.mode === "plan" || suggested.mode === "ask" ? suggested.mode : null;
    const label = suggestedModeLabel(dest);
    setMessages((prev) =>
      resolveUserChoiceInMessages(prev, {
        status: "answered",
        answers: [{ prompt: "选择", answer: `切换到 ${label}` }],
      }),
    );
    setPending(null);
    setErrorMsg("");
    streamActivityRef.current = [];
    liveTurnRef.current = emptyLiveTurn();
    setLiveTurn(emptyLiveTurn());
    try {
      await sendResume(
        currentConvId,
        { action: "switch" },
        handlers(currentConvId, afterRun),
        { signal: beginStream(currentConvId) },
      );
      if (dest === "plan") {
        setWorkflowMode("plan");
        changeRightView("plan");
      } else if (dest === "ask") {
        setWorkflowMode("ask");
      } else {
        setWorkflowMode(null);
        changeRightView("workspace");
      }
    } catch (e) {
      reportError(formatApiError(e, `无法切换到 ${label}`));
    }
  };

  const resolveRuleProposal = async (
    part: RuleProposalPart,
    action: "accept" | "ignore",
    draft: { scope: RuleScope; operation: RuleOperation; name: string; details: string },
  ) => {
    if (!currentConvId) return;
    try {
      const result = await api.resolveRuleProposal(currentConvId, part.id, {
        action,
        scope: draft.scope,
        operation: draft.operation,
        name: draft.name,
        details: draft.details,
      });
      const event = result.event;
      setMessages((prev) => attachEventsToMessages(prev, [event]));
      setLiveTurn((prev) => {
        if (!prev?.ruleProposals?.length) return prev;
        return {
          ...prev,
          ruleProposals: prev.ruleProposals.map((item) =>
            item.id === part.id
              ? {
                  ...item,
                  status: event.status,
                  scope: event.scope,
                  operation: event.operation,
                  name: event.name || draft.name,
                  details: event.details || event.text || draft.details,
                }
              : item,
          ),
        };
      });
    } catch (e) {
      reportError(formatApiError(e, action === "accept" ? "无法写入 Rule" : "无法忽略提案"));
    }
  };

  const dismissSuggestMode = async () => {
    if (!currentConvId) return;
    setMessages((prev) =>
      resolveUserChoiceInMessages(prev, {
        status: "dismissed",
        answers: [{ prompt: "选择", answer: "暂不切换" }],
      }),
    );
    setPending(null);
    setErrorMsg("");
    streamActivityRef.current = [];
    liveTurnRef.current = emptyLiveTurn();
    setLiveTurn(emptyLiveTurn());
    try {
      await sendResume(currentConvId, { action: "dismiss" },
        handlers(currentConvId, afterRun),
        { signal: beginStream(currentConvId) },
      );
    } catch (e) {
      reportError(formatApiError(e, "提交失败"));
    }
  };

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background text-foreground">
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button onClick={() => navigate("/")}>返回首页</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        <span className="ws-spin mr-2" />
        加载项目中…
      </div>
    );
  }

  return (
    <div className="shell-atmosphere flex h-full min-h-0 flex-col text-foreground">
      <TopBar
        projects={projects}
        currentId={currentId}
        llmConfigured={llmConfigured}
        onHome={() => navigate("/")}
        onSelect={selectProject}
        onCreate={createProject}
        onRename={renameProject}
        onDelete={deleteProject}
        onSettings={() => setWorkspaceSettingsOpen(true)}
      />

      <WorkspaceSettingsDialog
        open={workspaceSettingsOpen}
        onOpenChange={setWorkspaceSettingsOpen}
        panelFollowMode={panelFollowMode}
        onPanelFollowModeChange={setPanelFollowMode}
        projectId={currentId || undefined}
      />

      <div className="flex min-h-0 flex-1">
        <ConversationList
          conversations={conversations}
          folders={folders}
          currentId={currentConvId}
          pendingId={pending ? currentConvId : null}
          runningIds={runningIds}
          disabled={false}
          onSelect={selectConversation}
          onCreate={(folderId) => createConversation("plan", folderId)}
          onRename={renameConversation}
          onDelete={deleteConversation}
          onCreateFolder={createFolder}
          onRenameFolder={renameFolder}
          onDeleteFolder={deleteFolder}
          onMoveConversation={moveConversation}
        />

        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 min-w-0 flex-1"
          defaultLayout={defaultLayout}
          onLayoutChanged={persistLayouts}
        >
          <ResizablePanel id="chat" defaultSize={`${midPct}%`} minSize="28%">
            <ChatPanel
              messages={messages}
              liveTurn={liveTurn}
              running={running}
              input={input}
              errorMsg={errorMsg}
              hasConversation={!!currentConvId}
              conversationId={currentConvId}
              workflowMode={workflowMode}
              selectedModel={selectedModel}
              liveContextUsage={currentConvId ? liveContextById[currentConvId] ?? null : null}
              onModelChange={changeModel}
              pendingQuestion={
                isPendingQuestion(pending)
                  ? pending
                  : planQuestionsFromLastMessage(messages)
              }
              pendingSuggestMode={isPendingSuggestMode(pending) ? pending : null}
              composerRef={composerRef}
              onInput={setInput}
              onSend={send}
              onStop={stopGeneration}
              stopping={stopping}
              onDismissError={() => setErrorMsg("")}
              onSubmitAnswers={submitAnswers}
              onSubmitPermission={submitPermission}
              onEnterPlan={enterPlanPhase}
              onLeavePlan={leavePlanPhase}
              onEnterAsk={enterAskPhase}
              onLeaveAsk={leaveAskPhase}
              onAcceptSuggestMode={acceptSuggestMode}
              onDismissSuggestMode={dismissSuggestMode}
              onResolveRuleProposal={resolveRuleProposal}
              onOpenFile={openFileFromChat}
            />
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel id="right" defaultSize={`${rightPct}%`} minSize="22%" maxSize="50%">
            <div className="flex h-full min-h-0 flex-col">
              <RightViewSwitcher
                value={rightView}
                onChange={changeRightView}
                planBadge={!!planMarkdown.trim()}
              />
              <div className="min-h-0 flex-1">
                {rightView === "plan" ? (
                  <PlanPanel
                    planMarkdown={planMarkdown}
                    planTitle={planTitle}
                    planStatus={planStatus}
                    running={running}
                    composerRef={composerRef}
                    onExecutePlan={executePlanFromPanel}
                    executePlanStarting={executePlanStarting}
                  />
                ) : (
                  <WorkspacePanel
                    workspace={workspace}
                    projectId={currentId}
                    projectName={projects.find((p) => p.id === currentId)?.name}
                    conversations={conversations}
                    currentConvId={currentConvId}
                    selectedPath={selectedDocPath}
                    highlightedPath={highlightedDocPath}
                    focusPath={docFocusPath}
                    onFocusPathConsumed={() => setDocFocusPath(null)}
                    onSelectPath={setSelectedDocPath}
                    onWorkspace={setWorkspace}
                    onOpenPlan={openPlanFromExplorer}
                  />
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {dialog && <Dialog config={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
