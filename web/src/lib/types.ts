/** Shared types aligned with openapi/openapi.yaml and doc/底层技术契约与设计.md */

export type AssetVisibility = "private" | "public" | "deleted";

export type AssetImage = {
  id: string;
  assetId: string;
  url: string;
  extraPrompt: string | null;
  createdAt: string;
  generationStatus: "pending" | "done" | "failed";
};

export type AssetFull = {
  id: string;
  name: string;
  description: string;
  annotation: string | null;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  visibility: "private" | "public";
  forkedFromId: string | null;
  forkCount: number;
  /** API may send null for empty; treat as []. */
  images: AssetImage[] | null;
  coverImageId: string | null;
  /** Private library folder; null = ungrouped. */
  groupId?: string | null;
  deletedAt: null;
};

export type AssetDeletedGhost = {
  id: string;
  visibility: "deleted";
  forkedFromId: string | null;
  deletedAt: string;
};

export type Asset = AssetFull | AssetDeletedGhost;

export type Me = {
  id: string;
  username: string;
  displayName: string | null;
};

export type AssetGroup = {
  id: string;
  name: string;
  position: number;
  createdAt?: string;
};

export type AssetGroupList = { items: AssetGroup[] };

export type UserPublic = {
  id: string;
  username: string;
  displayName: string | null;
};

export type PaginatedAssets = {
  items: Asset[];
  nextCursor: string | null;
  total: number | null;
};

export type ForkNode = {
  id: string;
  name: string;
  visibility: AssetVisibility;
  forkedFromId: string | null;
  deletedAt: string | null;
};

export type ForkPage = { direction: "upstream" | "downstream"; nodes: ForkNode[] };

/** 会话分组（与素材库的 asset group 不同）：控制多个 AI 会话是否共用同一套暂存区。 */
export type StagingGroupDraft = "independent" | "shared";

export type SessionStagingGroup = {
  id: string;
  name: string;
  position: number;
  draftStaging: StagingGroupDraft;
  createdAt: string;
};

export type SessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  draftAssetCount: number;
  /** 所属分组；无分组时为 null（旧数据可能缺省）。 */
  stagingGroup?: { id: string; name: string; draftStaging: StagingGroupDraft } | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

export type DraftAsset = {
  tempId: string;
  name: string;
  description: string;
  done: boolean;
  /** Per-session staging row in an independent group; use for PATCH/DELETE paths. */
  ownerSessionId?: string;
  ownerSessionTitle?: string;
};

export type SessionDetail = SessionSummary & {
  messages: ChatMessage[];
  draftAssets: DraftAsset[];
};

export type ProjectSummary = { id: string; name: string; updatedAt: string };

export type ProjectDetail = ProjectSummary & {
  canvasDocument: Record<string, unknown> | null;
};

/** tldraw scene format is opaque JSON; we only persist light asset refs in metadata when needed. */
export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "asset_start"; id: string }
  | {
      type: "asset_field";
      id: string;
      field: "name" | "description";
      delta: string;
    }
  | { type: "asset_end"; id: string };
