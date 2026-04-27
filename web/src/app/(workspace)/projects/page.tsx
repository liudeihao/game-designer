import Link from "next/link";
import { serverFetch } from "@/lib/server-api";
import type { ProjectSummary } from "@/lib/types";

async function load(): Promise<ProjectSummary[]> {
  try {
    const r = await serverFetch("/api/projects");
    if (!r.ok) return [];
    const data = (await r.json()) as ProjectSummary[] | null;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function ProjectsPage() {
  const list = await load();
  return (
    <div className="px-6 py-8">
      <h1 className="font-display text-2xl">项目</h1>
      <ul className="mt-6 space-y-2">
        {(list ?? []).map((p) => (
          <li key={p.id}>
            <Link
              className="text-ui-mono flex items-center justify-between rounded border border-border bg-surface/60 px-4 py-3 text-sm"
              href={`/projects/${p.id}/canvas`}
            >
              {p.name}
              <span className="text-[11px] text-text-muted">打开画布</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
