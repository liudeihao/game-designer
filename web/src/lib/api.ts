import type {
  Asset,
  DraftAsset,
  Me,
  PaginatedAssets,
  ProjectDetail,
  SessionDetail,
  SessionSummary,
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
  /** My library / explore: only assets with zero rows in asset_images */
  imageNo?: boolean
) {
  const u = new URL("/api/assets", window.location.origin);
  u.searchParams.set("scope", scope);
  u.searchParams.set("limit", String(limit));
  if (cursor) u.searchParams.set("cursor", cursor);
  if (groupId) u.searchParams.set("groupId", groupId);
  if (visibility) u.searchParams.set("visibility", visibility);
  if (imageNo) u.searchParams.set("img", "no");
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

export async function getSession(id: string) {
  const r = await fetch(`/api/sessions/${id}`, { credentials: "include" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("session");
  return r.json() as Promise<SessionDetail>;
}

export async function postSession(title?: string) {
  const r = await fetch("/api/sessions", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!r.ok) throw new Error("create session");
  return r.json() as Promise<SessionDetail>;
}

export async function postChatStream(sessionId: string, message: string) {
  return fetch(`/api/sessions/${sessionId}/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
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
  return r.json() as Promise<ProjectDetail[]>;
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

export async function exportDraftsToLibrary(drafts: DraftAsset[]) {
  for (const d of drafts) {
    if (d.name && d.description) {
      await createAsset({ name: d.name, description: d.description });
    }
  }
}
