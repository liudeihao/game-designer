"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AssetGrid } from "@/components/asset/AssetGrid";
import { AssetInspectorPanel } from "@/components/library/AssetInspectorPanel";
import { WorkspaceHorizontalSplit } from "@/components/shell/WorkspaceHorizontalSplit";
import type { PaginatedAssets } from "@/lib/types";

export function ExploreView({ initialData }: { initialData: PaginatedAssets }) {
  const sp = useSearchParams();
  const router = useRouter();
  const previewId = sp.get("asset")?.trim() || null;

  const openPreview = useCallback(
    (id: string) => {
      const next = new URLSearchParams(sp.toString());
      next.set("asset", id);
      router.replace(`/explore?${next.toString()}`);
    },
    [router, sp]
  );

  const closePreview = useCallback(() => {
    const next = new URLSearchParams(sp.toString());
    next.delete("asset");
    const qs = next.toString();
    router.replace(qs ? `/explore?${qs}` : "/explore");
  }, [router, sp]);

  const grid = (
    <AssetGrid
      scope="public"
      initialData={initialData}
      cardInteraction="inspector"
      onInspectAsset={openPreview}
    />
  );

  if (!previewId) {
    return (
      <div className="gd-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4">
        {grid}
      </div>
    );
  }

  return (
    <WorkspaceHorizontalSplit
      storageKey="layout:explore-preview"
      leftDefaultSize={67}
      leftMinSize={36}
      rightMinSize={22}
      rightClassName="bg-bg-base"
      className="min-h-0 min-w-0 flex-1"
      left={
        <div className="gd-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto px-6 pb-8 pt-4">
          {grid}
        </div>
      }
      right={
        <AssetInspectorPanel assetId={previewId} onClose={closePreview} className="min-w-[260px]" />
      }
    />
  );
}
