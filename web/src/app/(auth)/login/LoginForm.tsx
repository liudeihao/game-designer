"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { loginAccount } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await loginAccount({ email: email.trim(), password });
      const from = sp.get("from");
      router.push(from && from.startsWith("/") ? from : "/explore");
      router.refresh();
    } catch {
      setErr("登录失败，请检查邮箱与密码。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded border border-border bg-surface/40 px-6 py-8">
      <h1 className="font-display text-2xl text-text-primary">登录</h1>
      <p className="text-ui-mono mt-1 text-xs text-text-muted">使用已注册邮箱与密码</p>
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
          密码
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg-base px-3 py-2 text-sm text-text-primary"
            required
          />
        </label>
        {err && <p className="text-ui-mono text-xs text-rose-400">{err}</p>}
        <button
          type="submit"
          disabled={loading}
          className="text-ui-mono w-full rounded border border-accent bg-accent/15 py-2 text-sm text-accent hover:bg-accent/25 disabled:opacity-50"
        >
          {loading ? "…" : "登录"}
        </button>
      </form>
      <p className="text-ui-mono mt-4 text-center text-xs text-text-muted">
        没有账号？{" "}
        <Link href="/register" className="text-accent hover:underline">
          注册
        </Link>
      </p>
    </div>
  );
}
