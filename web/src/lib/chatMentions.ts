import type { ProjectLinkedAsset } from "@/lib/types";

/** User-visible token inserted by the @ picker (stable id for expansion on send). */
export const ASSET_MENTION_RE = /@\[([^\]]*)\]\(asset:([^)]+)\)/g;

function assetMap(assets: ProjectLinkedAsset[]): Map<string, ProjectLinkedAsset> {
  return new Map(assets.map((a) => [a.id, a]));
}

/** Escape `]` in display name so the token stays parseable. */
export function formatAssetMentionToken(asset: ProjectLinkedAsset): string {
  const name = asset.name.replace(/\]/g, " ").trim() || "素材";
  return `@[${name}](asset:${asset.id})`;
}

/**
 * Replace mention tokens with blocks the model can use (name + description + id).
 * Unknown ids still emit title from the bracket text.
 */
export function expandAssetMentionsForApi(raw: string, assets: ProjectLinkedAsset[]): string {
  const map = assetMap(assets);
  return raw.replace(ASSET_MENTION_RE, (_full, bracketName: string, id: string) => {
    const a = map.get(id);
    const title = (a?.name ?? bracketName).trim() || id;
    const desc = a?.description?.trim();
    const lines = [`【引用素材：${title}】`, `素材 ID：${id}`];
    if (desc) lines.push(desc);
    return lines.join("\n");
  });
}

export type MentionQuery = { start: number; query: string };

/** If caret is inside an active @mention fragment, return start index and query after @. */
export function getActiveMentionQuery(text: string, caret: number): MentionQuery | null {
  if (caret < 0 || caret > text.length) return null;
  const before = text.slice(0, caret);
  const atAscii = before.lastIndexOf("@");
  const atWide = before.lastIndexOf("＠");
  const at = Math.max(atAscii, atWide);
  if (at === -1) return null;
  if (at > 0) {
    const prev = before[at - 1];
    if (prev !== undefined && !/\s/.test(prev)) return null;
  }
  const afterAt = before.slice(at + 1);
  if (afterAt.includes("\n")) return null;
  if (/\s/.test(afterAt)) return null;
  /* Do not treat cursor inside an inserted token `@[…](asset:…)` as a new mention. */
  if (afterAt.includes("[") || afterAt.includes("]")) return null;
  return { start: at, query: afterAt };
}
