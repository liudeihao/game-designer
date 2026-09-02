import type { ContextUsage } from "../types";

/** Never paint another conversation's snapshot; live SSE wins when present. */
export function pickContextUsage(
  conversationId: string | null,
  live: ContextUsage | null | undefined,
  fetched: ContextUsage | null,
  fetchedFor: string | null,
): ContextUsage | null {
  if (!conversationId) return null;
  if (live) return live;
  if (fetched && fetchedFor === conversationId) return fetched;
  return null;
}
