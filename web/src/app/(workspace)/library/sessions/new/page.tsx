"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { listSessionStagingGroups, postSession } from "@/lib/api";
import { ThemeSelect } from "@/components/ui/ThemeSelect";

function NewSessionPageInner() {
  const r = useRouter();
  const searchParams = useSearchParams();
  const [t, setT] = useState("");
  const [groupId, setGroupId] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: groups = [] } = useQuery({
    queryKey: ["session-staging-groups"],
    queryFn: listSessionStagingGroups,
  });

  useEffect(() => {
    const g = searchParams.get("group");
    if (g && groups.some((x) => x.id === g)) setGroupId(g);
  }, [searchParams, groups]);

  return (
    <div className="gd-scrollbar flex h-full min-h-0 flex-col overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display text-2xl">新会话</h1>
        <input
          className="text-ui-mono mt-4 w-full border-b border-border bg-transparent py-2 outline-none focus:border-accent"
          placeholder="主题（如：废土道具）"
          value={t}
          onChange={(e) => setT(e.target.value)}
        />
        {groups.length > 0 && (
          <div className="text-ui-mono mt-4 text-xs text-text-muted">
            <p id="new-sg-label" className="mb-1 block">
              会话分组（可选）
            </p>
            <ThemeSelect
              id="new-sg"
              aria-labelledby="new-sg-label"
              className="max-w-none"
              value={groupId}
              options={[
                { value: "", label: "无" },
                ...groups.map((g) => ({
                  value: g.id,
                  label: `${g.name}（${g.draftStaging === "shared" ? "组内共享暂存" : "各会话独立暂存"}）`,
                })),
              ]}
              onValueChange={setGroupId}
            />
          </div>
        )}
        <button
          type="button"
          className="text-ui-mono mt-4 rounded bg-accent/15 px-4 py-2 text-sm text-accent"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const s = await postSession(t || undefined, groupId || undefined);
              r.replace(`/library/sessions/${s.id}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          开始
        </button>
      </div>
    </div>
  );
}

export default function NewSessionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-0 items-center justify-center px-4 py-6">
          <p className="text-ui-mono text-sm text-text-muted">加载…</p>
        </div>
      }
    >
      <NewSessionPageInner />
    </Suspense>
  );
}
