"use client";

import { useState } from "react";

export function DevLoginButton() {
  const [st, setSt] = useState<"idle" | "ok" | "err">("idle");
  if (process.env.NEXT_PUBLIC_DEV_LOGIN !== "1") return null;
  return (
    <div className="text-ui-mono pointer-events-auto fixed bottom-2 right-2 z-50 flex items-center gap-2 rounded border border-border/80 bg-bg-base/90 px-2 py-1 text-xs text-text-muted">
      <span>dev</span>
      <button
        type="button"
        onClick={async () => {
          setSt("idle");
          const r = await fetch("/api/dev/login", { method: "POST", credentials: "include" });
          setSt(r.ok ? "ok" : "err");
        }}
        className="rounded border border-border px-1.5 py-0.5 hover:border-accent/40"
      >
        登录
      </button>
      {st === "ok" && <span className="text-emerald-400">ok</span>}
      {st === "err" && <span className="text-rose-400">fail</span>}
    </div>
  );
}
