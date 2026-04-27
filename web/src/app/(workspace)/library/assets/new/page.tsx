"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAsset } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function NewAssetPage() {
  const r = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="font-display text-2xl">新建素材</h1>
      <p className="text-ui-mono mt-2 text-[12px] text-text-muted">写下第一个概念的名称与描述</p>
      <form
        className="mt-8 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          setErr(null);
          setSaving(true);
          try {
            const a = await createAsset({ name, description });
            r.push(`/library/assets/${a.id}`);
          } catch {
            setErr("创建失败，请重试。");
          } finally {
            setSaving(false);
          }
        }}
      >
        <div>
          <label className="text-ui-mono text-[11px] text-text-muted">名称</label>
          <input
            className={cn(
              "mt-1 w-full border-b border-border bg-transparent py-2 text-ui-mono text-sm text-text-primary outline-none",
              "focus:border-accent"
            )}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={saving}
            placeholder="例如：NEBULA GATE"
          />
        </div>
        <div>
          <label className="text-ui-mono text-[11px] text-text-muted">描述</label>
          <textarea
            className="mt-1 min-h-28 w-full resize-y rounded border border-border bg-surface/80 p-3 text-sm text-text-primary outline-none focus:border-accent"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            disabled={saving}
          />
        </div>
        {err && <p className="text-ui-mono text-[12px] text-error-dim">{err}</p>}
        {saving && (
          <p className="text-ui-mono text-[12px] text-accent" role="status">
            正在创建素材，请稍候…
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="gd-btn-dataflow text-ui-mono rounded bg-accent/20 px-4 py-2 text-sm text-accent hover:bg-accent/30 disabled:opacity-50"
        >
          {saving ? "创建中…" : "创建"}
        </button>
      </form>
    </div>
  );
}
