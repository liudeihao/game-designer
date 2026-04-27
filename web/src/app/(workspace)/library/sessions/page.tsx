import Link from "next/link";
import { serverFetch } from "@/lib/server-api";
import type { SessionSummary } from "@/lib/types";

async function load(): Promise<SessionSummary[]> {
  try {
    const r = await serverFetch("/api/sessions");
    if (!r.ok) return [];
    const data = (await r.json()) as SessionSummary[] | null;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function SessionsPage() {
  const rows = await load();
  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl">AI 会话</h1>
        <Link
          href="/library/sessions/new"
          className="text-ui-mono rounded border border-border px-3 py-1.5 text-sm hover:border-accent/40"
        >
          新会话
        </Link>
      </div>
      <ul className="space-y-2">
        {rows.map((s) => (
          <li key={s.id}>
            <Link
              href={`/library/sessions/${s.id}`}
              className="text-ui-mono flex items-center justify-between rounded border border-border bg-surface/60 px-4 py-3 text-sm text-text-primary hover:border-accent/30"
            >
              {s.title}
              <span className="text-[11px] text-text-muted">{s.draftAssetCount} 条暂存</span>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="text-ui-mono text-text-muted">还没有会话，创建一个开始。</p>}
      <p className="text-ui-mono mt-6 text-[11px] text-text-muted">
        <Link href="/library/sessions/archive" className="hover:text-accent">
          归档
        </Link>
      </p>
    </div>
  );
}
