"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerAccount } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await registerAccount({
        email: email.trim(),
        password,
        username: username.trim(),
        displayName: displayName.trim() || null,
      });
      router.push("/explore");
      router.refresh();
    } catch {
      setErr("注册失败：邮箱或用户名已存在，或不符合规则。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded border border-border bg-surface/40 px-6 py-8">
      <h1 className="font-display text-2xl text-text-primary">注册</h1>
      <p className="text-ui-mono mt-1 text-xs text-text-muted">邮箱需唯一；用户名 1–32 位字母数字下划线；密码至少 8 位</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-ui-mono text-xs text-text-muted">
          邮箱
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg-base px-3 py-2 text-sm text-text-primary"
            required
          />
        </label>
        <label className="block text-ui-mono text-xs text-text-muted">
          用户名
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg-base px-3 py-2 text-sm text-text-primary"
            required
            pattern="[a-zA-Z0-9_]{1,32}"
            title="1–32 位：字母、数字、下划线"
          />
        </label>
        <label className="block text-ui-mono text-xs text-text-muted">
          显示名（可选）
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg-base px-3 py-2 text-sm text-text-primary"
          />
        </label>
        <label className="block text-ui-mono text-xs text-text-muted">
          密码（≥8 位）
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg-base px-3 py-2 text-sm text-text-primary"
            required
            minLength={8}
          />
        </label>
        {err && <p className="text-ui-mono text-xs text-rose-400">{err}</p>}
        <button
          type="submit"
          disabled={loading}
          className="gd-btn-dataflow text-ui-mono w-full rounded border border-accent bg-accent/15 py-2 text-sm text-accent hover:bg-accent/25 disabled:opacity-50"
        >
          {loading ? "…" : "注册并登录"}
        </button>
      </form>
      <p className="text-ui-mono mt-4 text-center text-xs text-text-muted">
        已有账号？{" "}
        <Link href="/login" className="text-accent hover:underline">
          登录
        </Link>
      </p>
    </div>
  );
}
