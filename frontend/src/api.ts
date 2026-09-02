import type {
  ContextUsage,
  Conversation,
  ConversationFolder,
  ConversationSnapshot,
  PlanArchive,
  ProjectMeta,
  ProjectSnapshot,
  RuleItem,
  RuleSetPayload,
  StreamFrame,
  TraceEndEvent,
  TraceStartEvent,
  UsageAnalytics,
  UsageScopes,
  WorkspaceSnapshot,
} from "./types";
import type { LLMConfigPublic } from "./types/llm";
import { pushDebugEvent } from "./debug/log";
import { unwrapStreamFrame } from "./studio/applyFrame";

const API = "/api";

export class ApiHttpError extends Error {
  status: number;
  detail: unknown;
  url?: string;
  method?: string;

  constructor(status: number, detail: unknown, message: string, url?: string, method?: string) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.detail = detail;
    this.url = url;
    this.method = method;
  }
}

function truncateBody(s: string, n = 4000) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function isProxyOrEmptyFailure(status: number, detail: unknown): boolean {
  if (status === 502 || status === 503 || status === 504) return true;
  if (status !== 500) return false;
  if (detail == null || detail === "") return true;
  const text = typeof detail === "string" ? detail : JSON.stringify(detail);
  return /ECONNREFUSED|ECONNRESET|proxy error|Bad Gateway/i.test(text);
}

export function formatApiError(err: unknown, fallback = "请求失败"): string {
  if (err instanceof ApiHttpError) {
    if (isProxyOrEmptyFailure(err.status, err.detail)) {
      return "后端未启动或已断开（无法连接 http://127.0.0.1:8000）";
    }
    if (err.message) return err.message;
    return `请求失败 (${err.status})`;
  }
  if (err instanceof TypeError) {
    return "网络错误：无法连接后端，请确认后端已启动 (http://127.0.0.1:8000)";
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const started = Date.now();
  try {
    const res = await fetch(input, init);
    if (!res.ok) {
      const body = await res.clone().text().catch(() => "");
      const empty = !body.trim();
      pushDebugEvent({
        level: "error",
        source: "http",
        message: `${method} ${input} → ${res.status} ${res.statusText || "Error"}`.trim(),
        method,
        url: input,
        status: res.status,
        statusText: res.statusText,
        body: empty
          ? res.status >= 500
            ? "(响应体为空。Vite 在后端断开时会把代理失败显示成 500，请确认 http://127.0.0.1:8000 仍在运行)"
            : ""
          : truncateBody(body),
        durationMs: Date.now() - started,
      });
    }
    return res;
  } catch (err) {
    if (init?.signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    pushDebugEvent({
      level: "error",
      source: "network",
      message: `${method} ${input} 网络失败: ${message}`,
      method,
      url: input,
      durationMs: Date.now() - started,
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }
}

function httpErrorFromBody(res: Response, body: unknown, url?: string, method?: string): ApiHttpError {
  const detail =
    body && typeof body === "object" && body !== null && "detail" in body
      ? (body as { detail: unknown }).detail
      : body;
  const message =
    typeof detail === "string"
      ? detail
      : detail && typeof detail === "object" && detail !== null && "message" in detail
        && typeof (detail as { message: unknown }).message === "string"
        ? (detail as { message: string }).message
        : detail && typeof detail === "object" && detail !== null && "code" in detail
          ? String((detail as { code: unknown }).code)
          : `${res.status} ${res.statusText}`;
  return new ApiHttpError(res.status, detail, message, url, method);
}

/** Normalize workspace from API responses. */
export function normalizeWorkspace(snap: {
  workspace?: WorkspaceSnapshot;
}): WorkspaceSnapshot {
  const ws = snap.workspace;
  return {
    files: { ...(ws?.files ?? {}) },
    revs: { ...(ws?.revs ?? {}) },
  };
}

function encodeDocsPath(filePath: string): string {
  return filePath
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      try {
        body = await res.text();
      } catch {
        body = null;
      }
    }
    throw httpErrorFromBody(res, body, res.url);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () =>
    apiFetch(`${API}/health`).then((r) => j<{ status: string; llm_configured: boolean }>(r)),

  listProjects: () =>
    apiFetch(`${API}/projects`).then((r) => j<{ projects: ProjectMeta[] }>(r)).then((d) => d.projects),

  createProject: (name: string) =>
    apiFetch(`${API}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((r) => j<ProjectMeta>(r)),

  getProject: (id: string) =>
    apiFetch(`${API}/projects/${id}`).then(async (r) => {
      const snap = await j<ProjectSnapshot>(r);
      return { ...snap, workspace: normalizeWorkspace(snap) };
    }),

  listDocsFiles: (projectId: string, path = "") => {
    const q = path ? `?path=${encodeURIComponent(path)}` : "";
    return apiFetch(`${API}/projects/${projectId}/docs/files${q}`).then((r) =>
      j<{ path: string; entries: { path: string; type: "file" | "dir"; bytes?: number }[] }>(r),
    );
  },

  readDocsFile: (projectId: string, filePath: string) =>
    apiFetch(`${API}/projects/${projectId}/docs/files/${encodeDocsPath(filePath)}`).then((r) =>
      j<{ ok: boolean; path: string; content: string; rev: number }>(r),
    ),

  writeDocsFile: (
    projectId: string,
    filePath: string,
    content: string | null,
    basedOnRev: number | null,
  ) =>
    apiFetch(`${API}/projects/${projectId}/docs/files/${encodeDocsPath(filePath)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, based_on_rev: basedOnRev }),
    }).then((r) =>
      j<{ ok: boolean; path: string; rev?: number; workspace: WorkspaceSnapshot }>(r),
    ),

  renameProject: (id: string, name: string) =>
    apiFetch(`${API}/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((r) => j<ProjectMeta>(r)),

  updateProject: (id: string, patch: { name?: string; label?: string }) =>
    apiFetch(`${API}/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => j<ProjectMeta>(r)),

  deleteProject: (id: string) =>
    apiFetch(`${API}/projects/${id}`, { method: "DELETE" }).then((r) => j(r)),

  listConversations: (projectId: string) =>
    apiFetch(`${API}/projects/${projectId}/conversations`)
      .then((r) => j<{ conversations: Conversation[]; folders?: ConversationFolder[] }>(r))
      .then((d) => d.conversations),

  listFolders: (projectId: string) =>
    apiFetch(`${API}/projects/${projectId}/folders`)
      .then((r) => j<{ folders: ConversationFolder[] }>(r))
      .then((d) => d.folders),

  listConversationsAndFolders: (projectId: string) =>
    apiFetch(`${API}/projects/${projectId}/conversations`).then((r) =>
      j<{ conversations: Conversation[]; folders: ConversationFolder[] }>(r),
    ),

  createFolder: (projectId: string, name: string) =>
    apiFetch(`${API}/projects/${projectId}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((r) => j<ConversationFolder>(r)),

  renameFolder: (folderId: string, name: string) =>
    apiFetch(`${API}/folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((r) => j<ConversationFolder>(r)),

  deleteFolder: (folderId: string) =>
    apiFetch(`${API}/folders/${folderId}`, { method: "DELETE" }).then((r) => j(r)),

  createConversation: (
    projectId: string,
    opts?: { title?: string; mode?: "plan" | "ask" | null; folder_id?: string | null },
  ) =>
    apiFetch(`${API}/projects/${projectId}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: opts?.title ?? "新对话",
        mode: opts?.mode ?? "",
        folder_id: opts?.folder_id ?? null,
      }),
    }).then((r) => j<Conversation>(r)),

  executePlan: (
    conversationId: string,
    h: SSEHandlers,
    opts?: { signal?: AbortSignal },
  ) => streamSSE(`${API}/conversations/${conversationId}/execute-plan`, {}, h, opts?.signal),

  enterPlan: (conversationId: string) =>
    apiFetch(`${API}/conversations/${conversationId}/enter-plan`, { method: "POST" }).then((r) =>
      j<{
        conversation: Conversation;
        plan_markdown?: string;
        plan_title?: string;
        plan_archives?: PlanArchive[];
        fresh?: boolean;
      }>(r)
    ),

  listPlans: (conversationId: string) =>
    apiFetch(`${API}/conversations/${conversationId}/plans`).then((r) =>
      j<{ plans: PlanArchive[] }>(r)
    ),

  readPlan: (conversationId: string, planPath: string) =>
    apiFetch(`${API}/conversations/${conversationId}/plans/${planPath}`).then((r) =>
      j<{ path: string; title: string; markdown: string }>(r)
    ),

  leavePlan: (conversationId: string) =>
    apiFetch(`${API}/conversations/${conversationId}/leave-plan`, { method: "POST" }).then((r) =>
      j<{ conversation: Conversation }>(r)
    ),

  enterAsk: (conversationId: string) =>
    apiFetch(`${API}/conversations/${conversationId}/enter-ask`, { method: "POST" }).then((r) =>
      j<{ conversation: Conversation }>(r)
    ),

  leaveAsk: (conversationId: string) =>
    apiFetch(`${API}/conversations/${conversationId}/leave-ask`, { method: "POST" }).then((r) =>
      j<{ conversation: Conversation }>(r)
    ),

  getConversation: (id: string) =>
    apiFetch(`${API}/conversations/${id}`).then(async (r) => {
      const snap = await j<ConversationSnapshot>(r);
      return { ...snap, workspace: normalizeWorkspace(snap) };
    }),

  getContextUsage: (id: string, model?: string, signal?: AbortSignal, providerId?: string) => {
    const params = new URLSearchParams();
    if (model) params.set("model", model);
    if (providerId) params.set("provider_id", providerId);
    const q = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`${API}/conversations/${id}/context-usage${q}`, signal ? { signal } : undefined).then(
      (r) => j<ContextUsage>(r),
    );
  },

  renameConversation: (id: string, title: string) =>
    apiFetch(`${API}/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).then((r) => j<Conversation>(r)),

  moveConversation: (id: string, folder_id: string | null) =>
    apiFetch(`${API}/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_id }),
    }).then((r) => j<Conversation>(r)),

  deleteConversation: (id: string) =>
    apiFetch(`${API}/conversations/${id}`, { method: "DELETE" }).then((r) => j(r)),

  stopRun: (conversationId: string) =>
    apiFetch(`${API}/conversations/${conversationId}/stop`, { method: "POST" }).then((r) =>
      j<{ stopping: boolean }>(r),
    ),

  getConfig: () =>
    apiFetch(`${API}/config`).then((r) =>
      j<{
        llm: LLMConfigPublic;
        llm_configured: boolean;
      }>(r)
    ),

  updateConfig: (body: Record<string, unknown>) =>
    apiFetch(`${API}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j<{ llm: LLMConfigPublic; llm_configured: boolean }>(r)),

  getUserRule: () => apiFetch(`${API}/rules/user`).then((r) => j<RuleSetPayload>(r)),

  saveUserRule: (rules: RuleItem[]) =>
    apiFetch(`${API}/rules/user`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules }),
    }).then((r) => j<RuleSetPayload>(r)),

  getProjectRule: (projectId: string) =>
    apiFetch(`${API}/projects/${projectId}/rules`).then((r) => j<RuleSetPayload>(r)),

  saveProjectRule: (projectId: string, rules: RuleItem[]) =>
    apiFetch(`${API}/projects/${projectId}/rules`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules }),
    }).then((r) => j<RuleSetPayload>(r)),

  resolveRuleProposal: (
    conversationId: string,
    proposalId: string,
    body: {
      action: "accept" | "ignore";
      scope?: string;
      operation?: string;
      name?: string;
      details?: string;
    },
  ) =>
    apiFetch(`${API}/conversations/${conversationId}/rule-proposals/${proposalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j<{ ok: boolean; event: import("./types").RuleProposalEvent; rule: unknown }>(r)),

  getUsage: (params?: { projectId?: string; conversationId?: string; turnId?: string }) => {
    const q = new URLSearchParams();
    if (params?.projectId) q.set("project_id", params.projectId);
    if (params?.conversationId) q.set("conversation_id", params.conversationId);
    if (params?.turnId) q.set("turn_id", params.turnId);
    const qs = q.toString();
    return apiFetch(`${API}/usage${qs ? `?${qs}` : ""}`).then((r) => j<UsageScopes>(r));
  },

  getUsageAnalytics: (params?: { since?: string; until?: string; projectId?: string }) => {
    const q = new URLSearchParams();
    if (params?.since) q.set("since", params.since);
    if (params?.until) q.set("until", params.until);
    if (params?.projectId) q.set("project_id", params.projectId);
    const qs = q.toString();
    return apiFetch(`${API}/usage/analytics${qs ? `?${qs}` : ""}`).then((r) => j<UsageAnalytics>(r));
  },
};

export interface SSEHandlers {
  onFrame?: (frame: StreamFrame) => void;
  onToken?: (text: string, node: string) => void;
  onReasoning?: (text: string, node: string) => void;
  onTraceStart?: (payload: TraceStartEvent) => void;
  onTraceEnd?: (payload: TraceEndEvent) => void;
  onActivity?: (entry: any) => void;
  onPending?: (payload: any) => void;
  onPlan?: (markdown: string, extra?: { progress?: unknown; title?: string }) => void;
  onDone?: (payload: any) => void;
  onError?: (message: string) => void;
  onAbort?: () => void;
  onUsage?: (usage: UsageScopes) => void;
  /** Always runs when the stream stops, including aborts and silent EOF. */
  onClose?: () => void;
}

async function streamSSE(
  url: string,
  body: unknown,
  h: SSEHandlers,
  signal?: AbortSignal,
) {
  try {
    return await readSSE(url, body, h, signal);
  } finally {
    h.onClose?.();
  }
}

async function readSSE(
  url: string,
  body: unknown,
  h: SSEHandlers,
  signal?: AbortSignal,
) {
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let parsed: unknown = null;
    const text = await res.text().catch(() => "");
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    throw httpErrorFromBody(res, parsed, url, "POST");
  }
  if (!res.body) throw new Error("服务器未返回流式响应");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let event = "message";
        let data = "";
        for (const line of raw.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice(7).trim();
          else if (line.startsWith("data: ")) data += line.slice(6);
        }
        if (!data) continue;
        let parsed: any;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        const { frame, payload } = unwrapStreamFrame(event, parsed);
        const body: any = payload;
        const liveViaFrame = Boolean(frame && h.onFrame);
        if (frame) h.onFrame?.(frame);
        if (!liveViaFrame && event === "token") h.onToken?.(body?.text, body?.node ?? "");
        else if (!liveViaFrame && event === "reasoning") h.onReasoning?.(body?.text, body?.node ?? "");
        else if (!liveViaFrame && event === "trace_start") h.onTraceStart?.(body);
        else if (!liveViaFrame && event === "trace_end") h.onTraceEnd?.(body);
        else if (!liveViaFrame && event === "pending") h.onPending?.(body);
        if (event === "activity") h.onActivity?.(body);
        else if (event === "plan")
          h.onPlan?.(body?.markdown, { progress: body?.progress, title: body?.title });
        else if (event === "usage") h.onUsage?.(body);
        else if (event === "done") {
          if (body?.usage) h.onUsage?.(body.usage);
          h.onDone?.(body);
        }
        else if (event === "error") {
          pushDebugEvent({
            level: "error",
            source: "sse",
            message: String(body?.message ?? "SSE error"),
            method: "POST",
            url,
            detail: body,
          });
          h.onError?.(body?.message);
        }
      }
    }
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      h.onAbort?.();
      return;
    }
    pushDebugEvent({
      level: "error",
      source: "sse",
      message: `SSE 中断: ${err instanceof Error ? err.message : String(err)}`,
      method: "POST",
      url,
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  }
}

export function sendChat(
  conversationId: string,
  instruction: string,
  h: SSEHandlers,
  opts?: { model?: string; signal?: AbortSignal },
) {
  const body: Record<string, string> = { instruction };
  if (opts?.model) body.model = opts.model;
  return streamSSE(`${API}/conversations/${conversationId}/chat`, body, h, opts?.signal);
}

export function sendResume(
  conversationId: string,
  decisions: Record<string, unknown>,
  h: SSEHandlers,
  opts?: { signal?: AbortSignal },
) {
  return streamSSE(
    `${API}/conversations/${conversationId}/resume`,
    { decisions },
    h,
    opts?.signal,
  );
}
