"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createProject } from "@/lib/api";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="gd-scrollbar flex h-full min-h-0 flex-col overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display text-2xl">新项目</h1>
        <p className="text-ui-mono mt-2 text-xs leading-relaxed text-text-muted">
          创建后可进入「设计」与 AI 多会话讨论玩法与叙事，并在「情绪板」画布中拼贴素材；画布会自动保存。
        </p>
        <input
          className="text-ui-mono mt-4 w-full border-b border-border bg-transparent py-2 outline-none focus:border-accent"
          placeholder="项目名称（如：废土 Roguelike 概念）"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          aria-label="项目名称"
        />
        {err && <p className="text-ui-mono mt-2 text-xs text-error-dim/90">{err}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="text-ui-mono rounded bg-accent/15 px-4 py-2 text-sm text-accent disabled:cursor-not-allowed disabled:opacity-40"
            disabled={busy}
            onClick={async () => {
              const n = name.trim();
              if (!n) {
                setErr("请填写项目名称");
                return;
              }
              setErr(null);
              setBusy(true);
              try {
                const p = await createProject({ name: n });
                router.replace(`/projects/${p.id}/design`);
              } catch {
                setErr("创建失败，请检查网络或稍后重试。");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "创建中…" : "创建并进入项目"}
          </button>
          <Link
            href="/projects"
            className="text-ui-mono inline-flex items-center py-2 text-sm text-text-muted hover:text-accent"
          >
            取消
          </Link>
        </div>
      </div>
    </div>
  );
}
