"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { patchProject } from "@/lib/api";

export function ProjectSettingsForm({
  projectId,
  initialName,
}: {
  projectId: string;
  initialName: string;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="mt-6 max-w-md space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const n = name.trim();
        if (!n) {
          setErr("名称不能为空");
          return;
        }
        setErr(null);
        setBusy(true);
        try {
          await patchProject(projectId, { name: n });
          void qc.invalidateQueries({ queryKey: ["project", projectId] });
          router.refresh();
        } catch {
          setErr("保存失败，请重试。");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <label htmlFor="proj-name" className="text-ui-mono text-xs uppercase text-text-muted">
          项目名称
        </label>
        <input
          id="proj-name"
          className="text-ui-mono mt-1.5 w-full border-b border-border bg-transparent py-2 text-sm text-text-primary outline-none focus:border-accent"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          autoComplete="off"
        />
      </div>
      {err && <p className="text-ui-mono text-xs text-error-dim/90">{err}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy || name.trim() === initialName.trim()}
          className="text-ui-mono rounded bg-accent/15 px-4 py-2 text-sm text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "保存中…" : "保存"}
        </button>
        <Link
          href={`/projects/${projectId}/canvas`}
          className="text-ui-mono inline-flex items-center rounded border border-border px-4 py-2 text-sm text-text-muted hover:border-accent/30 hover:text-text-primary"
        >
          进入画布
        </Link>
        <Link href="/projects" className="text-ui-mono inline-flex items-center text-sm text-text-muted hover:text-accent">
          ← 返回项目列表
        </Link>
      </div>
    </form>
  );
}
