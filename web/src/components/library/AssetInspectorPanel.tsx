"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, GitFork, X } from "lucide-react";
import { getAsset, getForkGraph } from "@/lib/api";
import { isAssetFull } from "@/lib/guards";
import type { AssetFull } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProceduralPlaceholder } from "@/components/asset/ProceduralPlaceholder";

/** Image-related prompts only; description is shown in its own section to avoid duplication. */
function promptForAssetImages(asset: AssetFull): { label: string; text: string } | null {
  const imgs = asset.images ?? [];
  if (asset.coverImageId) {
    const row = imgs.find((i) => i.id === asset.coverImageId);
    if (row?.extraPrompt?.trim()) return { label: "封面图 AI Prompt", text: row.extraPrompt.trim() };
  }
  const firstWithPrompt = imgs.find((i) => i.extraPrompt?.trim());
  if (firstWithPrompt) return { label: "图像 AI Prompt", text: firstWithPrompt.extraPrompt!.trim() };
  return null;
}

function exploreAssetHref(id: string) {
  return `/explore?asset=${encodeURIComponent(id)}`;
}

/** Right-hand preview on /explore when `?asset=` is set. Read-only, no stash. */
export function AssetInspectorPanel({
  assetId,
  onClose,
  className,
}: {
  assetId: string;
  onClose: () => void;
  className?: string;
}) {
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

  return (
    <aside
      className={cn("gd-scrollbar flex h-full min-h-0 flex-col bg-bg-base/95", className)}
      aria-label="素材预览"
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border/50 px-3 py-2">
        <h2 className="font-display min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
          {full?.name ?? "加载中…"}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {assetId && (
            <Link
              href={`/library/assets/${encodeURIComponent(assetId)}`}
              className="text-ui-mono inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-xs text-text-muted hover:border-accent/35 hover:text-accent"
              title="打开完整详情页"
            >
              <ExternalLink className="h-3 w-3" />
              详情页
            </Link>
          )}
          <button
            type="button"
            className="rounded p-1.5 text-text-muted hover:bg-surface hover:text-text-primary"
            aria-label="关闭预览"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {assetQ.isLoading && <p className="text-ui-mono text-xs text-text-muted">加载素材…</p>}
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
            <div className="relative mb-4 aspect-video w-full overflow-hidden rounded-md border border-border/60 bg-surface/40">
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

            <p className="text-ui-mono mb-3 text-[11px] leading-relaxed text-text-muted/90">
              公开素材，全站用户在「探索」中可见。编辑与隐私设置请前往详情页（需作者本人）。
            </p>

            <dl className="text-ui-mono mb-4 space-y-2.5 border-b border-border/40 pb-4 text-xs">
              <div className="flex gap-2">
                <dt className="w-12 shrink-0 text-text-muted">作者</dt>
                <dd className="min-w-0 text-text-primary">
                  <Link
                    href={`/u/${encodeURIComponent(full.author.username)}`}
                    className="text-accent/90 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    @{full.author.username}
                  </Link>
                  {full.author.displayName?.trim() ? (
                    <span className="text-text-muted"> · {full.author.displayName.trim()}</span>
                  ) : null}
                </dd>
              </div>
              {full.forkedFromId ? (
                <div className="flex gap-2">
                  <dt className="w-12 shrink-0 text-text-muted">来源</dt>
                  <dd className="min-w-0">
                    <Link
                      href={exploreAssetHref(full.forkedFromId)}
                      className="text-accent/90 underline-offset-2 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      由其他素材 Fork 改编
                    </Link>
                  </dd>
                </div>
              ) : null}
              <div className="flex gap-2">
                <dt className="w-12 shrink-0 text-text-muted">衍生</dt>
                <dd className="text-text-primary/90">
                  {full.forkCount > 0 ? (
                    <>已被他人基于此素材创建 {full.forkCount} 条下游素材</>
                  ) : (
                    <span className="text-text-muted">暂无下游 Fork</span>
                  )}
                </dd>
              </div>
            </dl>

            {(() => {
              const promptBlock = promptForAssetImages(full);
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

            {full.description?.trim() && (
              <section className="mb-4">
                <p className="text-ui-mono mb-1 text-xs uppercase tracking-wide text-text-muted">简介</p>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-text-primary/90">
                  {full.description.trim()}
                </p>
              </section>
            )}

            {full.annotation?.trim() && (
              <section className="mb-4">
                <p className="text-ui-mono mb-1 text-xs uppercase tracking-wide text-text-muted">备注</p>
                <p className="whitespace-pre-wrap text-xs text-text-muted">{full.annotation.trim()}</p>
              </section>
            )}

            {(full.tags?.length ?? 0) > 0 && (
              <section className="mb-4">
                <p className="text-ui-mono mb-1 text-xs uppercase tracking-wide text-text-muted">标签</p>
                <div className="flex flex-wrap gap-1">
                  {full.tags!.map((t) => (
                    <span key={t} className="rounded border border-border/50 bg-surface/40 px-1.5 py-0.5 text-xs text-text-primary/90">
                      {t}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <section className="mb-2">
              <div className="mb-2 flex items-center gap-1.5">
                <GitFork className="h-3.5 w-3.5 text-text-muted" />
                <p className="text-ui-mono text-xs uppercase tracking-wide text-text-muted">Fork 网络（节选）</p>
              </div>
              {forkQ.isLoading && <p className="text-xs text-text-muted">加载关系…</p>}
              {forkQ.isError && <p className="text-xs text-text-muted">无法加载 Fork 图。</p>}
              {forkQ.data && (
                <>
                  <ul className="space-y-1.5">
                    {forkQ.data.nodes.slice(0, 14).map((n) => (
                      <li key={n.id}>
                        <Link
                          href={
                            n.visibility === "public"
                              ? exploreAssetHref(n.id)
                              : `/library/assets/${encodeURIComponent(n.id)}`
                          }
                          className={cn(
                            "text-ui-mono line-clamp-1 block rounded px-1 py-0.5 text-xs hover:bg-accent/10",
                            n.id === forkQ.data.focusAssetId ? "text-accent" : "text-text-primary"
                          )}
                          onClick={(e) => e.stopPropagation()}
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
                      onClick={(e) => e.stopPropagation()}
                    >
                      查看完整 Fork 图 →
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
