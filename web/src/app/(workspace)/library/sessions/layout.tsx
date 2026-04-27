import { SessionsLayoutClient } from "@/components/session/SessionsLayoutClient";
import { serverFetch } from "@/lib/server-api";
import type { SessionSummary } from "@/lib/types";
import type { ReactNode } from "react";

async function loadSessionList(): Promise<SessionSummary[]> {
  try {
    const r = await serverFetch("/api/sessions");
    if (!r.ok) return [];
    const data = (await r.json()) as SessionSummary[] | null;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function LibrarySessionsLayout({ children }: { children: ReactNode }) {
  const initialSessionList = await loadSessionList();
  return <SessionsLayoutClient initialSessionList={initialSessionList}>{children}</SessionsLayoutClient>;
}
