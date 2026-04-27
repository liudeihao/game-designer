"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postSession } from "@/lib/api";

export default function NewSessionPage() {
  const r = useRouter();
  const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="font-display text-2xl">新会话</h1>
      <input
        className="text-ui-mono mt-4 w-full border-b border-border bg-transparent py-2 outline-none focus:border-accent"
        placeholder="主题（如：废土道具）"
        value={t}
        onChange={(e) => setT(e.target.value)}
      />
      <button
        type="button"
        className="text-ui-mono mt-4 rounded bg-accent/15 px-4 py-2 text-sm text-accent"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const s = await postSession(t || undefined);
            r.replace(`/library/sessions/${s.id}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        开始
      </button>
    </div>
  );
}
