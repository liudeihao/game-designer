import type {
  Asset,
  AssetFull,
  AssetImage,
  ChatMessage,
  DraftAsset,
  ForkNode,
  Me,
  PaginatedAssets,
  ProjectDetail,
  SessionDetail,
} from "@/lib/types";

const now = () => new Date().toISOString();

const me: Me = {
  id: "user-1",
  username: "indiedev",
  displayName: "Indie",
};

const authorPublic = { id: "user-2", name: "archivist" };

const assets: Map<string, AssetFull> = new Map();
let ghostForkParent = "asset-seed-ghost-parent";

const img = (
  id: string,
  assetId: string,
  w: number,
  extra: string | null,
  status: AssetImage["generationStatus"] = "done"
): AssetImage => ({
  id,
  assetId,
  url: `https://picsum.photos/seed/${id}/${w}/400`,
  extraPrompt: extra,
  createdAt: now(),
  generationStatus: status,
});

function seed() {
  const a1: AssetFull = {
    id: "a-public-1",
    name: "RUST TOWER",
    description: "A collapsed transmission tower, orange rust against violet smog. Used as a landmark in exploration zones.",
    annotation: "Keep silhouette readable at small size.",
    authorId: authorPublic.id,
    createdAt: now(),
    updatedAt: now(),
    visibility: "public",
    forkedFromId: null,
    forkCount: 2,
    images: [img("im1", "a-public-1", 800, "cinematic, film grain", "done")],
    coverImageId: "im1",
    deletedAt: null,
  };
  const a2: AssetFull = {
    id: "a-public-2",
    name: "HOLLOW VENDOR",
    description: "Defunct street vending machine, hollow interior lit by a single green tube.",
    annotation: null,
    authorId: authorPublic.id,
    createdAt: now(),
    updatedAt: now(),
    visibility: "public",
    forkedFromId: null,
    forkCount: 0,
    images: [],
    coverImageId: null,
    deletedAt: null,
  };
  const forked: AssetFull = {
    id: "a-mine-1",
    name: "RUST TOWER (FORK PRIME)",
    description: a1.description + " Fork notes: more cables, more danger.",
    annotation: null,
    authorId: me.id,
    createdAt: now(),
    updatedAt: now(),
    visibility: "private",
    forkedFromId: a1.id,
    forkCount: 0,
    images: [img("im2", "a-mine-1", 400, "add rain", "done")],
    coverImageId: "im2",
    deletedAt: null,
  };
  assets.set(a1.id, a1);
  assets.set(a2.id, a2);
  assets.set(forked.id, forked);
  ghostForkParent = "asset-seed-ghost-parent";
}

seed();

const sessions: Map<string, SessionDetail> = new Map();

function ensureSessions() {
  if (sessions.size) return;
  const id = "sess-1";
  sessions.set(id, {
    id,
    title: "Wasteland props",
    updatedAt: now(),
    draftAssetCount: 0,
    messages: [
      {
        id: "m-1",
        role: "user",
        content: "赛博朋克风格废弃加油站的加油泵",
        createdAt: now(),
      },
      {
        id: "m-2",
        role: "assistant",
        content: "我提炼了这条素材。",
        createdAt: now(),
      },
    ],
    draftAssets: [
      { tempId: "temp-1", name: "DRIED PUMP", description: "双层塑料外壳，裸露电缆。", done: true },
    ],
  });
}

const projects: Map<string, ProjectDetail> = new Map();

function ensureProjects() {
  if (projects.size) return;
  const id = "proj-1";
  projects.set(id, {
    id,
    name: "Untitled project",
    updatedAt: now(),
    canvasDocument: { type: "tldraw", version: 1, shapeIds: [] },
  });
}
ensureProjects();

export function getMe(): Me {
  return { ...me };
}

export function listPublicAssets(
  cursor: string | null,
  limit: number
): PaginatedAssets {
  const all = Array.from(assets.values()).filter((a) => a.visibility === "public");
  return paginateAssets(all, cursor, limit);
}

export function listPrivateAssets(
  cursor: string | null,
  limit: number
): PaginatedAssets {
  const all = Array.from(assets.values()).filter((a) => a.authorId === me.id);
  return paginateAssets(all, cursor, limit);
}

function paginateAssets(
  list: AssetFull[],
  cursor: string | null,
  limit: number
): PaginatedAssets {
  const sorted = [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  let start = 0;
  if (cursor) {
    const idx = sorted.findIndex((a) => a.id === cursor);
    start = idx >= 0 ? idx + 1 : 0;
  }
  const page = sorted.slice(start, start + limit);
  const hasMore = start + page.length < sorted.length;
  const items: Asset[] = page.map((a) => ({ ...a }));
  const last = page[page.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? last.id : null,
    total: sorted.length,
  };
}

export function getAsset(id: string): Asset | null {
  if (id === "deleted-1" || id === ghostForkParent) {
    return {
      id: ghostForkParent,
      visibility: "deleted",
      forkedFromId: null,
      deletedAt: now(),
    };
  }
  const a = assets.get(id);
  if (!a) return null;
  return { ...a };
}

export function createAsset(
  data: { name: string; description: string; annotation?: string | null; forkedFromId?: string | null }
): AssetFull {
  const id = "a-" + Math.random().toString(36).slice(2, 10);
  const row: AssetFull = {
    id,
    name: data.name,
    description: data.description,
    annotation: data.annotation ?? null,
    authorId: me.id,
    createdAt: now(),
    updatedAt: now(),
    visibility: "private",
    forkedFromId: data.forkedFromId ?? null,
    forkCount: 0,
    images: [],
    coverImageId: null,
    deletedAt: null,
  };
  assets.set(id, row);
  return row;
}

export function patchAsset(
  id: string,
  path: { name?: string; description?: string; annotation?: string | null; coverImageId?: string | null }
): AssetFull | null {
  const a = assets.get(id);
  if (!a) return null;
  if (a.authorId !== me.id) return null;
  if (path.name != null) a.name = path.name;
  if (path.description != null) a.description = path.description;
  if (path.annotation !== undefined) a.annotation = path.annotation;
  if (path.coverImageId !== undefined) a.coverImageId = path.coverImageId;
  a.updatedAt = now();
  assets.set(id, a);
  return a;
}

export function publish(id: string): AssetFull | null {
  const a = assets.get(id);
  if (!a || a.authorId !== me.id) return null;
  a.visibility = "public";
  a.updatedAt = now();
  assets.set(id, a);
  return a;
}

export function forkFrom(sourceId: string): AssetFull | null {
  const src = assets.get(sourceId);
  if (!src) return null;
  if (src.visibility === "public") {
    return createAsset({
      name: src.name + " (FORK)",
      description: src.description,
      forkedFromId: src.id,
    });
  }
  if (src.authorId === me.id) {
    return createAsset({ name: src.name + " (COPY)", description: src.description, forkedFromId: src.id });
  }
  return null;
}

export function getForks(
  id: string,
  direction: "upstream" | "downstream"
): { nodes: ForkNode[] } {
  const self = assets.get(id);
  const nodes: ForkNode[] = [];
  if (direction === "upstream" && self?.forkedFromId) {
    const p = getAsset(self.forkedFromId);
    if (p && "name" in p) {
      nodes.push({
        id: p.id,
        name: p.name,
        visibility: p.visibility,
        forkedFromId: p.forkedFromId,
        deletedAt: null,
      });
    } else if (p && p.visibility === "deleted") {
      nodes.push({ id: p.id, name: "", visibility: "deleted", forkedFromId: p.forkedFromId, deletedAt: p.deletedAt });
    }
  }
  if (direction === "downstream") {
    for (const a of assets.values()) {
      if (a.forkedFromId === id) {
        nodes.push({
          id: a.id,
          name: a.name,
          visibility: a.visibility,
          forkedFromId: a.forkedFromId,
          deletedAt: null,
        });
      }
    }
  }
  return { nodes };
}

export function requestImage(
  assetId: string,
  extraPrompt: string | null
): { asset: AssetFull | null; image: AssetImage | null; error?: string } {
  const a = assets.get(assetId);
  if (!a) return { asset: null, image: null, error: "not_found" };
  if (a.visibility === "public" && a.authorId !== me.id) {
    return { asset: a, image: null, error: "forbidden" };
  }
  const imId = "im-" + Math.random().toString(36).slice(2, 8);
  const image: AssetImage = {
    id: imId,
    assetId,
    url: `https://picsum.photos/seed/${imId}/800/800`,
    extraPrompt,
    createdAt: now(),
    generationStatus: "pending",
  };
  a.images = [...a.images, image];
  a.updatedAt = now();
  assets.set(assetId, a);
  // simulate done quickly in API by flipping to done (client can poll; we return done in same request for mock)
  image.generationStatus = "done";
  return { asset: a, image };
}

export function setCover(assetId: string, coverImageId: string | null) {
  return patchAsset(assetId, { coverImageId });
}

export function listSessions(): SessionDetail[] {
  ensureSessions();
  return Array.from(sessions.values());
}

export function getSession(id: string): SessionDetail | null {
  ensureSessions();
  return sessions.get(id) ?? null;
}

export function createSession(title?: string) {
  ensureSessions();
  const id = "sess-" + Math.random().toString(36).slice(2, 8);
  const row: SessionDetail = {
    id,
    title: title || "新会话",
    updatedAt: now(),
    draftAssetCount: 0,
    messages: [],
    draftAssets: [],
  };
  sessions.set(id, row);
  return row;
}

export function appendMessage(sessionId: string, message: ChatMessage) {
  const s = getSession(sessionId);
  if (!s) return null;
  s.messages.push(message);
  s.updatedAt = now();
  sessions.set(sessionId, s);
  return s;
}

export function setDrafts(sessionId: string, draftAssets: DraftAsset[]) {
  const s = getSession(sessionId);
  if (!s) return null;
  s.draftAssets = draftAssets;
  s.draftAssetCount = draftAssets.length;
  s.updatedAt = now();
  sessions.set(sessionId, s);
  return s;
}

export function listProjects() {
  ensureProjects();
  return Array.from(projects.values());
}

export function createProject(name: string) {
  ensureProjects();
  const id = "proj-" + Math.random().toString(36).slice(2, 8);
  const row: ProjectDetail = {
    id,
    name,
    updatedAt: now(),
    canvasDocument: { type: "tldraw", version: 1, shapeIds: [] },
  };
  projects.set(id, row);
  return row;
}

export function getProject(id: string) {
  ensureProjects();
  return projects.get(id) ?? null;
}

export function patchProject(id: string, name?: string, canvasDocument?: Record<string, unknown> | null) {
  const p = projects.get(id);
  if (!p) return null;
  if (name) p.name = name;
  if (canvasDocument !== undefined) p.canvasDocument = canvasDocument;
  p.updatedAt = now();
  projects.set(id, p);
  return p;
}

export function getAssetFull(id: string): AssetFull | null {
  const a = assets.get(id);
  if (!a) return null;
  if (a.visibility === "public" || a.authorId === me.id) return a;
  return null;
}
