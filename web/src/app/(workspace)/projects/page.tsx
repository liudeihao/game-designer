import Link from "next/link";
import { BackendUnavailable } from "@/components/system/BackendUnavailable";
import { serverFetch } from "@/lib/server-api";
import type { ProjectSummary } from "@/lib/types";

async function load(): Promise<{ ok: true; list: ProjectSummary[] } | { ok: false }> {
  try {
    const r = await serverFetch("/api/projects");
    if (!r.ok) return { ok: false };
    const data = (await r.json()) as ProjectSummary[] | null;
    return { ok: true, list: Array.isArray(data) ? data : [] };
  } catch {
    return { ok: false };
  }
}

function formatUpdated(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default async function ProjectsPage() {
  const res = await load();
  if (!res.ok) {
    return (
      <div className="px-6 py-8">
        <h1 className="font-display text-2xl">项目</h1>
        <div className="mt-6">
          <BackendUnavailable title="无法加载项目列表" />
        </div>
      </div>
    );
  }
  const list = res.list;
  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl">项目</h1>
        <Link
          href="/projects/new"
          className="text-ui-mono shrink-0 rounded border border-accent/35 bg-accent/10 px-3 py-1.5 text-sm text-accent hover:bg-accent/15"
        >
          新项目
        </Link>
      </div>
      <p className="text-ui-mono mb-4 max-w-2xl text-[12px] leading-relaxed text-text-muted">
        在无限画布上拼贴「我的库」素材，搭建情绪板与概念布局；画布会自动保存到服务器。
      </p>
      <ul className="space-y-2">
        {list.map((p) => (
          <li key={p.id}>
            <div className="text-ui-mono flex flex-col gap-2 rounded border border-border bg-surface/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="truncate text-text-primary">{p.name}</p>
                <p className="mt-0.5 text-[11px] text-text-muted">更新 {formatUpdated(p.updatedAt)}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link
                  className="rounded border border-border/80 px-3 py-1 text-[12px] text-accent hover:border-accent/40"
                  href={`/projects/${p.id}/canvas`}
                >
                  打开画布
                </Link>
                <Link
                  className="rounded border border-border/60 px-3 py-1 text-[12px] text-text-muted hover:border-accent/30 hover:text-text-primary"
                  href={`/projects/${p.id}/settings`}
                >
                  设置
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {list.length === 0 && (
        <p className="text-ui-mono mt-4 text-[13px] text-text-muted">
          还没有项目。{" "}
          <Link href="/projects/new" className="text-accent hover:underline">
            创建一个
          </Link>
        </p>
      )}
    </div>
  );
}
