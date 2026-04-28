"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getMe, patchMe } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ProfileMediaSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [username, setUsername] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const me = await getMe();
      setUsername(me.username);
      setAvatarUrl(me.avatarUrl ?? "");
      setCoverUrl(me.coverUrl ?? "");
    } catch {
      setErr("无法加载账户信息");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    setDone(false);
    try {
      await patchMe({
        avatarUrl: avatarUrl.trim() === "" ? null : avatarUrl.trim(),
        coverUrl: coverUrl.trim() === "" ? null : coverUrl.trim(),
      });
      setDone(true);
      void load();
    } catch {
      setErr("保存失败，请检查 URL 是否为 http(s) 且长度合理");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-ui-mono text-xs text-text-muted">加载主页设置…</p>;
  }

  return (
    <div id="profile-media" className="scroll-mt-24 space-y-4">
      <p className="text-ui-mono text-xs leading-relaxed text-text-muted/90">
        使用 HTTPS 图片直链（如对象存储、图床）。留空则使用默认渐变封面与字母头像。
        {username ? (
          <>
            {" "}
            <Link href={`/u/${encodeURIComponent(username)}`} className="text-accent hover:underline">
              查看我的主页
            </Link>
          </>
        ) : null}
      </p>
      <div className="space-y-2">
        <label htmlFor="gd-cover-url" className="text-ui-mono text-xs text-text-muted">
          封面图 URL
        </label>
        <input
          id="gd-cover-url"
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          className="text-ui-mono w-full rounded border border-border/70 bg-surface/40 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted/50 focus:border-accent/50"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="gd-avatar-url" className="text-ui-mono text-xs text-text-muted">
          头像 URL
        </label>
        <input
          id="gd-avatar-url"
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          className="text-ui-mono w-full rounded border border-border/70 bg-surface/40 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted/50 focus:border-accent/50"
        />
      </div>
      {err && <p className="text-ui-mono text-xs text-error-dim">{err}</p>}
      {done && !err && <p className="text-ui-mono text-xs text-accent/90">已保存。</p>}
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className={cn(
          "text-ui-mono rounded border border-accent/45 bg-accent/10 px-4 py-2 text-sm text-accent",
          "hover:bg-accent/18 disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        {saving ? "保存中…" : "保存主页图片"}
      </button>
    </div>
  );
}
