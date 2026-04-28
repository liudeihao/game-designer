const LIBRARY_KEY = "gd:session-sidebar-pinned-ids";
const projectKey = (projectId: string) => `gd:session-sidebar-pinned-project:${projectId}`;

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function readLibraryPinnedSessionIds(): string[] {
  if (typeof window === "undefined") return [];
  return parseIds(window.localStorage.getItem(LIBRARY_KEY));
}

export function writeLibraryPinnedSessionIds(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(ids));
}

export function readProjectPinnedSessionIds(projectId: string): string[] {
  if (typeof window === "undefined") return [];
  return parseIds(window.localStorage.getItem(projectKey(projectId)));
}

export function writeProjectPinnedSessionIds(projectId: string, ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(projectKey(projectId), JSON.stringify(ids));
}

/** Pinned ids first (in saved order), then the rest in original order. */
export function sortSessionsByPinnedOrder<T extends { id: string }>(
  sessions: T[],
  pinnedOrder: string[]
): T[] {
  if (pinnedOrder.length === 0) return sessions;
  const pinnedSet = new Set(pinnedOrder);
  const pinned = pinnedOrder
    .map((id) => sessions.find((s) => s.id === id))
    .filter((s): s is T => s != null);
  const rest = sessions.filter((s) => !pinnedSet.has(s.id));
  return [...pinned, ...rest];
}

export function togglePinnedId(order: string[], id: string): string[] {
  if (order.includes(id)) return order.filter((x) => x !== id);
  return [id, ...order.filter((x) => x !== id)];
}
