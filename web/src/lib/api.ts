import type {
  Asset,
  DraftAsset,
  Me,
  PaginatedAssets,
  ProjectDetail,
  ProjectSessionSummary,
  ProjectSummary,
  SessionDetail,
  SessionStagingGroup,
  SessionSummary,
  StagingGroupDraft,
} from "./types";

const json = (r: Response) => r.json().catch(() => ({}));

export async function getMe() {
  const r = await fetch("/api/me", { credentials: "include" });
  if (!r.ok) throw new Error("me");
  return r.json() as Promise<Me>;
}

export async function registerAccount(body: {
  email: string;
  password: string;
  username: string;
  displayName?: string | null;
}) {
  const r = await fetch("/api/auth/register", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || "register");
  }
  return r.json() as Promise<Me>;
}

export async function loginAccount(body: { email: string; password: string }) {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || "login");
  }
  return r.json() as Promise<Me>;
}

export async function logoutAccount() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

export async function getAssets(
  scope: "public" | "private",
  cursor?: string | null,
  limit = 24,
  groupId?: string | null,
  /** My library: filter by material visibility */
  visibility?: "private" | "public" | null,
  /** Explore / user profile: filter public list by author username */
  authorUsername?: string | null
) {
  const u = new URL("/api/assets", window.location.origin);
  u.searchParams.set("scope", scope);
  u.searchParams.set("limit", String(limit));
  if (cursor) u.searchParams.set("cursor", cursor);
  if (groupId) u.searchParams.set("groupId", groupId);
  if (visibility) u.searchParams.set("visibility", visibility);
  if (authorUsername) u.searchParams.set("authorUsername", authorUsername);
  const r = await fetch(u, { credentials: "include" });
  if (!r.ok) throw new Error("assets");
  return r.json() as Promise<PaginatedAssets>;
}

export async function getAsset(id: string) {
  const r = await fetch(`/api/assets/${id}`, { credentials: "include" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("asset");
  return r.json() as Promise<Asset>;
}

export async function listAssetGroups() {
  const r = await fetch("/api/asset-groups", { credentials: "include" });
  if (!r.ok) throw new Error("asset-groups");
  return r.json() as Promise<import("./types").AssetGroupList>;
}

export async function createAssetGroup(name: string) {
  const r = await fetch("/api/asset-groups", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw new Error("create group");
  return r.json() as Promise<import("./types").AssetGroup>;
}

export async function deleteAssetGroup(id: string) {
  const r = await fetch(`/api/asset-groups/${id}`, { method: "DELETE", credentials: "include" });
  if (!r.ok) throw new Error("delete group");
}

export async function patchAsset(
  id: string,
  body: {
    name?: string;
    description?: string;
    annotation?: string | null;
    coverImageId?: string | null;
    groupId?: string | null;
  }
) {
  const r = await fetch(`/api/assets/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("patch");
  return r.json() as Promise<Asset>;
}

/** Soft-delete private asset (removed from library lists). Public assets return 400. */
export async function deleteAsset(id: string) {
  const r = await fetch(`/api/assets/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!r.ok) {
    let msg = "";
    try {
      const j = (await r.json()) as { error?: string };
      msg = (j.error || "").trim();
    } catch {
      /* ignore */
    }
    throw new Error(msg || `删除失败（${r.status}）`);
  }
}

export async function publishAsset(id: string) {
  const r = await fetch(`/api/assets/${id}/publish`, { method: "POST", credentials: "include" });
  if (!r.ok) throw new Error("publish");
  return r.json() as Promise<Asset>;
}

export async function forkAsset(id: string) {
  const r = await fetch(`/api/assets/${id}/fork`, { method: "POST", credentials: "include" });
  if (!r.ok) throw new Error("fork");
  return r.json() as Promise<Asset>;
}

export async function getForks(id: string, direction: "upstream" | "downstream") {
  const u = new URL(`/api/assets/${id}/forks`, window.location.origin);
  u.searchParams.set("direction", direction);
  u.searchParams.set("depth", "1");
  const r = await fetch(u, { credentials: "include" });
  if (!r.ok) throw new Error("forks");
  return r.json() as Promise<{ direction: string; nodes: import("./types").ForkNode[] }>;
}

export async function getForkGraph(
  id: string,
  opts?: {
    signal?: AbortSignal;
    maxUpstream?: number;
    downstreamDepth?: number;
    maxNodes?: number;
    expandFrom?: string;
    childLimit?: number;
  }
) {
  const u = new URL(`/api/assets/${encodeURIComponent(id)}/fork-graph`, window.location.origin);
  if (opts?.maxUpstream != null) u.searchParams.set("maxUpstream", String(opts.maxUpstream));
  if (opts?.downstreamDepth != null) u.searchParams.set("downstreamDepth", String(opts.downstreamDepth));
  if (opts?.maxNodes != null) u.searchParams.set("maxNodes", String(opts.maxNodes));
  if (opts?.expandFrom) u.searchParams.set("expandFrom", opts.expandFrom);
  if (opts?.childLimit != null) u.searchParams.set("childLimit", String(opts.childLimit));
  const r = await fetch(u, { credentials: "include", signal: opts?.signal });
  if (!r.ok) throw new Error("fork-graph");
  return r.json() as Promise<import("./types").ForkGraph>;
}

export async function postImage(id: string, extraPrompt: string | null) {
  const r = await fetch(`/api/assets/${id}/images`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ extraPrompt }),
  });
  if (!r.ok) {
    const err = await json(r);
    throw new Error((err as { error?: string })?.error || "image");
  }
  return r.json() as Promise<import("./types").AssetImage>;
}

export async function deleteAssetImage(assetId: string, imageId: string) {
  const r = await fetch(`/api/assets/${assetId}/images/${imageId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!r.ok) {
    const err = await json(r);
    throw new Error((err as { error?: string })?.error || "delete image");
  }
}

export async function listSessions() {
  const r = await fetch("/api/sessions", { credentials: "include" });
  if (!r.ok) throw new Error("sessions");
  return r.json() as Promise<SessionSummary[]>;
}

export async function listSessionStagingGroups() {
  const r = await fetch("/api/session-staging-groups", { credentials: "include" });
  if (!r.ok) throw new Error("session-staging-groups");
  return r.json() as Promise<SessionStagingGroup[]>;
}

export async function createSessionStagingGroup(name: string, draftStaging: StagingGroupDraft) {
  const r = await fetch("/api/session-staging-groups", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, draftStaging }),
  });
  if (!r.ok) throw new Error("create session-staging-group");
  return r.json() as Promise<SessionStagingGroup>;
}

export async function patchSessionStagingGroup(
  id: string,
  body: { name?: string; draftStaging?: StagingGroupDraft }
) {
  const r = await fetch(`/api/session-staging-groups/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("patch session-staging-group");
  return r.json() as Promise<SessionStagingGroup>;
}

export async function deleteSessionStagingGroup(id: string) {
  const r = await fetch(`/api/session-staging-groups/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!r.ok) throw new Error("delete session-staging-group");
}

/** All drafts in a staging group (shared pool or union of per-session rows). */
export async function listSessionStagingGroupDrafts(groupId: string) {
  const r = await fetch(`/api/session-staging-groups/${encodeURIComponent(groupId)}/drafts`, {
    credentials: "include",
  });
  if (!r.ok) throw new Error("session-staging-group drafts");
  const data = (await r.json()) as unknown;
  return Array.isArray(data) ? (data as DraftAsset[]) : [];
}

export async function getSession(id: string) {
  const r = await fetch(`/api/sessions/${id}`, { credentials: "include" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("session");
  return r.json() as Promise<SessionDetail>;
}

export async function postSession(title?: string, stagingGroupId?: string | null) {
  const body: { title?: string; stagingGroupId?: string | null } = {};
  if (title != null && title !== "") body.title = title;
  if (stagingGroupId !== undefined) body.stagingGroupId = stagingGroupId;
  const r = await fetch("/api/sessions", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("create session");
  return r.json() as Promise<SessionDetail>;
}

export async function patchSession(id: string, body: { title?: string; stagingGroupId?: string | null }) {
  const r = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("patch session");
  return r.json() as Promise<SessionDetail>;
}

export async function deleteSession(id: string) {
  const r = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (r.status === 404) throw new Error("not found");
  if (!r.ok) throw new Error("delete session");
}

export async function postChatStream(sessionId: string, message: string) {
  return fetch(`/api/sessions/${sessionId}/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
}

function draftByTempPath(sessionId: string, tempId: string) {
  return `/api/sessions/${encodeURIComponent(sessionId)}/drafts/${encodeURIComponent(tempId)}`;
}

/** User-authored staging row; requires name + description (not created by chat stream). */
export async function postSessionDraft(sessionId: string, body: { name: string; description: string }) {
  const r = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/drafts`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("session draft");
  return r.json() as Promise<DraftAsset>;
}

export async function patchSessionDraft(
  sessionId: string,
  tempId: string,
  body: { name: string; description: string }
) {
  const r = await fetch(draftByTempPath(sessionId, tempId), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("patch session draft");
  return r.json() as Promise<DraftAsset>;
}

export async function deleteSessionDraft(sessionId: string, tempId: string) {
  const r = await fetch(draftByTempPath(sessionId, tempId), {
    method: "DELETE",
    credentials: "include",
  });
  if (!r.ok) throw new Error("delete session draft");
}

export async function createAsset(body: { name: string; description: string; forkedFromId?: string | null }) {
  const r = await fetch("/api/assets", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("create asset");
  return r.json() as Promise<Asset>;
}

export async function listProjects() {
  const r = await fetch("/api/projects", { credentials: "include" });
  if (!r.ok) throw new Error("projects");
  return r.json() as Promise<ProjectSummary[]>;
}

export async function createProject(body: { name: string }) {
  const r = await fetch("/api/projects", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("create project");
  return r.json() as Promise<ProjectDetail>;
}

export async function getProject(id: string) {
  const r = await fetch(`/api/projects/${id}`, { credentials: "include" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("project");
  return r.json() as Promise<ProjectDetail>;
}

export async function patchProject(id: string, body: { name?: string; canvasDocument?: Record<string, unknown> | null }) {
  const r = await fetch(`/api/projects/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("patch project");
  return r.json() as Promise<ProjectDetail>;
}

export async function listProjectSessions(projectId: string) {
  const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/sessions`, {
    credentials: "include",
  });
  if (!r.ok) throw new Error("project sessions");
  const data = (await r.json()) as ProjectSessionSummary[] | null;
  return Array.isArray(data) ? data : [];
}

export async function createProjectSession(projectId: string, body?: { title?: string }) {
  const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/sessions`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error("create project session");
  return r.json() as Promise<SessionDetail>;
}

export async function linkProjectAsset(projectId: string, assetId: string) {
  const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assets`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetId }),
  });
  if (!r.ok) throw new Error("link project asset");
  return r.json() as Promise<ProjectDetail>;
}

export async function unlinkProjectAsset(projectId: string, assetId: string) {
  const r = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!r.ok) throw new Error("unlink project asset");
  return r.json() as Promise<ProjectDetail>;
}

/** Creates a library asset from the staging row and deletes that draft (server transaction). */
export async function exportSessionDraftToLibrary(sessionId: string, tempId: string): Promise<Asset> {
  const r = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/drafts/${encodeURIComponent(tempId)}/export-to-library`,
    { method: "POST", credentials: "include" }
  );
  if (!r.ok) {
    let detail = "";
    try {
      const j = (await r.json()) as { message?: string; error?: string };
      detail = (j.error || j.message || "").trim();
    } catch {
      detail = (await r.text()).trim();
    }
    throw new Error(detail || `导出失败（${r.status}）`);
  }
  return r.json() as Promise<Asset>;
}

export async function exportDraftToLibrary(d: DraftAsset, sessionIdForStagingApi: string): Promise<Asset> {
  return exportSessionDraftToLibrary(sessionIdForStagingApi, d.tempId);
}

export async function exportDraftsToLibrary(
  drafts: DraftAsset[],
  sessionIdForEach: (d: DraftAsset) => string
) {
  for (const d of drafts) {
    await exportDraftToLibrary(d, sessionIdForEach(d));
  }
}
