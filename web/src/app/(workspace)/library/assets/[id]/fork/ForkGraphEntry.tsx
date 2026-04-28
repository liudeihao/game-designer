"use client";

import dynamic from "next/dynamic";

const ForkTreePageClient = dynamic(
  () => import("@/components/fork/ForkTreePageClient").then((m) => m.ForkTreePageClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[calc(100svh-2.5rem)] flex-1 items-center justify-center">
        <p className="text-ui-mono text-sm text-text-muted">正在加载 fork 图组件…</p>
      </div>
    ),
  }
);

export function ForkGraphEntry({ id }: { id: string }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ForkTreePageClient key={id} focusAssetId={id} />
    </div>
  );
}
