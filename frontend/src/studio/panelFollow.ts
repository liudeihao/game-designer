import type { ActivityEntry } from "../types";
import { isHiddenDocsPath, normalizeDocsPath, parseDocsPath } from "./lib/docsPaths";

export type PanelFollowMode = "follow" | "highlight" | "off";

const STORAGE_KEY = "gd.panelFollowMode";

export function loadPanelFollowMode(): PanelFollowMode {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "follow" || raw === "highlight" || raw === "off") return raw;
  return "follow";
}

export function savePanelFollowMode(mode: PanelFollowMode) {
  localStorage.setItem(STORAGE_KEY, mode);
}

function pathFromWrite(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const path = normalizeDocsPath(String((item as { path?: unknown }).path || ""));
  if (!path || path.endsWith("/")) return null;
  return parseDocsPath(path) ?? (isHiddenDocsPath(path) ? null : path);
}

/** Map a live activity event to a docs path worth opening in the explorer. */
export function activityToDocPath(entry: ActivityEntry): string | null {
  const { detail } = entry;
  const writes = detail?.writes;
  if (Array.isArray(writes) && writes.length) {
    for (let i = writes.length - 1; i >= 0; i--) {
      const path = pathFromWrite(writes[i]);
      if (path) return path;
    }
  }

  const direct = detail?.path;
  if (typeof direct === "string") {
    const path = parseDocsPath(direct);
    if (path) return path;
  }

  return null;
}

/** @deprecated use activityToDocPath */
export function activityToTab(_entry: ActivityEntry): null {
  return null;
}

/** @deprecated */
export function routeToTab(_route: string | null | undefined): null {
  return null;
}
