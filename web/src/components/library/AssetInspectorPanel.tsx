"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, GitFork, PackagePlus, X } from "lucide-react";
import { getAsset, getForkGraph, getMe, patchAsset } from "@/lib/api";
import { stashAddEntry } from "@/components/library/LibraryStash";
import { isAssetFull } from "@/lib/guards";
import type { AssetFull } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProceduralPlaceholder } from "@/components/asset/ProceduralPlaceholder";

function promptForAsset(asset: AssetFull): { label: string; text: string } | null {
  const imgs = asset.images ?? [];
  if (asset.coverImageId) {
    const row = imgs.find((i) => i.id === asset.coverImageId);
    if (row?.extraPrompt?.trim()) return { label: "封面图 AI Prompt", text: row.extraPrompt.trim() };
  }
  const firstWithPrompt = imgs.find((i) => i.extraPrompt?.trim());
  if (firstWithPrompt) return { label: "图像 AI Prompt", text: firstWithPrompt.extraPrompt!.trim() };
  if (asset.description.trim()) return { label: "描述", text: asset.description.trim() };
  return null;
}

export function AssetInspectorPanel({
  assetId,
  onClose,
  className,
}: {
  assetId: string;
  onClose: () => void;
  className?: string;
}) {
  const qc = useQueryClient();
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    staleTime: 60_000,
  });
  const assetQ = useQuery({
    queryKey: ["asset", assetId],
    queryFn: async () => getAsset(assetId),
    enabled: !!assetId,
  });
  const forkQ = useQuery({
    queryKey: ["fork-graph", assetId, "inspector"],
    queryFn: async () =>
      getForkGraph(assetId, {
        maxNodes: 36,
        downstreamDepth: 3,
        maxUpstream: 12,
      }),
    enabled: !!assetId && assetQ.data != null && isAssetFull(assetQ.data),
  });

  const asset = assetQ.data;
  const full = asset && isAssetFull(asset) ? asset : null;
  const canEditTags = !!(me && full && me.id === full.authorId && full.visibility === "private");

  const [tagDraft, setTagDraft] = useState("");
  useEffect(() => {
    const tags = full?.tags;
    setTagDraft(tags?.length ? tags.join(", ") : "");
  }, [full?.id, full?.tags]);

  const saveTags = async () => {
    if (!full || !canEditTags) return;
    const tags = tagDraft
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    await patchAsset(assetId, { tags });
    void qc.invalidateQueries({ queryKey: ["asset", assetId] });
    void qc.invalidateQueries({ queryKey: ["asset-tags"] });
    void qc.invalidateQueries({ queryKey: ["assets"] });
  };

  return (
    <aside
      className={cn(
        "gd-scrollbar flex h-full min-h-0 flex-col border-l border-divider bg-bg-base/95",
        className
      )}
      aria-label="素材属性"
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border/50 px-3 py-2">
        <h2 className="font-display min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
          {full?.name ?? "加载中…"}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {assetId && (
            <>
              <button
                type="button"
                className="text-ui-mono inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-xs text-text-muted hover:border-accent/35 hover:text-accent"
                title="加入底部暂存"
                onClick={() => full && stashAddEntry(full.id, full.name)}
              >
                <PackagePlus className="h-3 w-3" />
                暂存
              </button>
              <Link
                href={`/library/assets/${encodeURIComponent(assetId)}`}
                className="text-ui-mono inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-xs text-text-muted hover:border-accent/35 hover:text-accent"
                title="在新语境打开完整详情页"
              >
                <ExternalLink className="h-3 w-3" />
                完整页
              </Link>
            </>
          )}
          <button
            type="button"
            className="rounded p-1.5 text-text-muted hover:bg-surface hover:text-text-primary"
            aria-label="关闭属性面板"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {assetQ.isLoading && (
          <p className="text-ui-mono text-xs text-text-muted">加载素材…</p>
        )}
        {assetQ.isError && (
          <p className="text-ui-mono text-xs text-error-dim/90">无法加载素材。</p>
        )}
        {!assetQ.isLoading && assetQ.data === null && (
          <p className="text-ui-mono text-xs text-text-muted">未找到素材。</p>
        )}
        {asset?.visibility === "deleted" && (
          <p className="text-ui-mono text-xs text-text-muted">该素材已删除，无法展示详情。</p>
        )}

        {full && (
          <>
            <div className="relative mb-3 aspect-video w-full overflow-hidden rounded-md border border-border/60 bg-surface/40">
              {(() => {
                const imgs = full.images ?? [];
                const cover = full.coverImageId
                  ? imgs.find((i) => i.id === full.coverImageId) ?? imgs[0]
                  : imgs[0];
                const url = cover?.url
                  ? cover.url.includes("?")
                    ? cover.url
                    : `${cover.url}?w=640`
                  : null;
                return url ? (
                  <Image src={url} alt="" fill className="object-cover" unoptimized />
                ) : (
                  <ProceduralPlaceholder seed={full.id} className="absolute inset-0 h-full w-full rounded-none" />
                );
              })()}
            </div>

            <div className="text-ui-mono mb-3 flex flex-wrap gap-2 text-xs">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5",
                  full.visibility === "public" ? "bg-accent/15 text-accent" : "bg-white/6 text-text-muted"
                )}
              >
                {full.visibility === "public" ? "探索中（全站）" : "仅自己可见"}
              </span>
              {full.forkedFromId && (
                <Link
                  href={`/library/assets/${encodeURIComponent(full.forkedFromId)}`}
                  className="text-accent/90 underline-offset-2 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  衍生自素材
                </Link>
              )}
              <span className="text-text-muted">分叉 {full.forkCount}</span>
            </div>

            {(() => {
              const promptBlock = promptForAsset(full);
              return promptBlock ? (
                <section className="mb-4">
                  <p className="text-ui-mono mb-1 text-xs uppercase tracking-wide text-text-muted">
                    {promptBlock.label}
                  </p>
                  <p className="gd-scrollbar max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-border/40 bg-surface/50 p-2 text-xs leading-relaxed text-text-primary">
                    {promptBlock.text}
                  </p>
                </section>
              ) : null;
            })()}

            {full.annotation?.trim() && (
              <section className="mb-4">
                <p className="text-ui-mono mb-1 text-xs uppercase tracking-wide text-text-muted">
                  备注
                </p>
                <p className="whitespace-pre-wrap text-xs text-text-muted">{full.annotation.trim()}</p>
              </section>
            )}

            <section className="mb-4">
              <p className="text-ui-mono mb-1 text-xs uppercase tracking-wide text-text-muted">标签</p>
              {canEditTags ? (
                <>
                  <textarea
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    rows={2}
                    placeholder="逗号分隔，如 角色, 场景"
                    className="w-full resize-y rounded border border-border/50 bg-surface/50 px-2 py-1.5 text-xs text-text-primary outline-none placeholder:text-text-muted/50"
                  />
                  <button
                    type="button"
                    className="text-ui-mono mt-1 rounded border border-accent/35 px-2 py-1 text-xs text-accent hover:bg-accent/10"
                    onClick={() => void saveTags()}
                  >
                    保存标签
                  </button>
                </>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {(full.tags ?? []).length === 0 ? (
                    <span className="text-xs text-text-muted">—</span>
                  ) : (
                    full.tags!.map((t) => (
                      <span key={t} className="rounded bg-white/8 px-1.5 py-0.5 text-xs text-text-muted">
                        {t}
                      </span>
                    ))
                  )}
                </div>
              )}
            </section>

            <section className="mb-4">
              <div className="mb-2 flex items-center gap-1.5">
                <GitFork className="h-3.5 w-3.5 text-text-muted" />
                <p className="text-ui-mono text-xs uppercase tracking-wide text-text-muted">
                  Fork 关系（缩略）
                </p>
              </div>
              {forkQ.isLoading && (
                <p className="text-xs text-text-muted">加载关系…</p>
              )}
              {forkQ.isError && (
                <p className="text-xs text-text-muted">无法加载 Fork 图。</p>
              )}
              {forkQ.data && (
                <>
                  <ul className="space-y-1.5">
                    {forkQ.data.nodes.slice(0, 14).map((n) => (
                      <li key={n.id}>
                        <Link
                          href={`/library/assets/${encodeURIComponent(n.id)}`}
                          className={cn(
                            "text-ui-mono line-clamp-1 block rounded px-1 py-0.5 text-xs hover:bg-accent/10",
                            n.id === forkQ.data.focusAssetId ? "text-accent" : "text-text-primary"
                          )}
                        >
                          {n.name || n.id.slice(0, 8)}
                          {n.visibility === "deleted" && (
                            <span className="ml-1 text-text-muted">（已删）</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {forkQ.data.truncated && (
                    <Link
                      href={`/library/assets/${encodeURIComponent(assetId)}/fork`}
                      className="mt-2 inline-block text-xs text-accent hover:underline"
                    >
                      在 Fork 页面查看完整关系 →
                    </Link>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
