"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { AssetImage } from "@/lib/types";
import { ProceduralPlaceholder } from "./ProceduralPlaceholder";
import { StatusDot } from "./StatusDot";
import { imageDisplaySrc } from "@/lib/imageDisplaySrc";
import { cn } from "@/lib/utils";

export function ImageStrip({
  assetId,
  images,
  coverImageId,
  onRefresh,
  onSetCover,
  onDeleteImage,
  onRequestImage,
  canGenerate,
  /** On asset detail, hide the procedural tile; list cards still use their own cover placeholder. */
  showProceduralWhenEmpty = true,
}: {
  assetId: string;
  /** May be null/undefined from API when no images; treat as none. */
  images: AssetImage[] | null | undefined;
  coverImageId: string | null;
  onRefresh: () => void;
  onSetCover: (imageId: string | null) => Promise<void>;
  onDeleteImage?: (imageId: string) => Promise<void>;
  onRequestImage: (extra: string | null) => Promise<AssetImage>;
  canGenerate: boolean;
  showProceduralWhenEmpty?: boolean;
}) {
  const [panel, setPanel] = useState(false);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<AssetImage | null>(null);
  const list = images ?? [];

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  return (
    <div className="space-y-3">
      <h2 className="text-ui-mono text-xs uppercase tracking-wider text-text-muted">图像（可选）</h2>
      <div className="gd-scrollbar flex gap-3 overflow-x-auto pb-2">
        {list.map((im) => {
          const isCover = coverImageId === im.id;
          const canSetCover = canGenerate && im.generationStatus === "done";
          const showMenu = canGenerate && (onDeleteImage != null || canSetCover);
          return (
            <div
              key={im.id}
              className={cn(
                "group relative h-60 w-60 shrink-0 cursor-pointer overflow-hidden rounded-md border bg-surface text-left outline-none ring-offset-bg-base focus-within:ring-2 focus-within:ring-accent/40",
                isCover ? "border-accent" : "border-border"
              )}
              tabIndex={0}
              aria-label="查看图像大图，悬停可展开操作"
              onClick={() => setLightbox(im)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setLightbox(im);
                }
              }}
            >
              {im.generationStatus === "pending" ? (
                <div className="flex h-full items-center justify-center">
                  <StatusDot status="pulse" label="生成中" />
                </div>
              ) : im.generationStatus === "failed" ? (
                <div className="flex h-full items-center justify-center p-2">
                  <StatusDot status="fail" label="失败" />
                </div>
              ) : (
                <Image
                  src={imageDisplaySrc(im.url, 800)}
                  alt=""
                  fill
                  className="object-cover"
                  unoptimized
                />
              )}
              {isCover && (
                <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-accent/25 px-1.5 py-0.5 text-ui-mono text-xs tracking-wide text-accent">
                  封面
                </span>
              )}
              {showMenu && (
                <div
                  className="absolute bottom-0 left-0 right-0 z-20 max-h-[55%] bg-gradient-to-t from-bg-base from-40% via-bg-base/85 to-transparent p-2 pt-6 opacity-0 pointer-events-none transition-opacity duration-150 max-md:opacity-100 max-md:pointer-events-auto group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <p className="text-ui-mono mb-1.5 text-xs uppercase tracking-[0.12em] text-text-muted/90">操作</p>
                  <div className="flex flex-col gap-1.5">
                    {canSetCover && (
                      <button
                        type="button"
                        className="text-ui-mono w-full rounded border border-border/70 bg-surface/95 px-2.5 py-1.5 text-left text-xs text-text-primary/95 hover:border-accent/45 hover:text-accent"
                        onClick={() => void onSetCover(im.id)}
                      >
                        设为封面
                      </button>
                    )}
                    {onDeleteImage && (
                      <button
                        type="button"
                        className="text-ui-mono w-full rounded border border-rose-900/50 bg-surface/95 px-2.5 py-1.5 text-left text-xs text-rose-300/95 hover:border-rose-500/50 hover:bg-rose-950/30"
                        onClick={() => {
                          if (!window.confirm("从本素材中移除此图像？此操作不可撤销。")) return;
                          void (async () => {
                            try {
                              await onDeleteImage(im.id);
                              onRefresh();
                            } catch {
                              /* toast optional */
                            }
                          })();
                        }}
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {canGenerate && (
          <button
            type="button"
            onClick={() => setPanel(true)}
            className="flex h-60 w-60 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-border text-text-muted hover:border-accent/40"
          >
            + 生图
          </button>
        )}
      </div>
      {panel && canGenerate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="image-gen-title"
          onClick={() => setPanel(false)}
        >
          <div
            className="w-full max-w-md rounded-md border border-border bg-bg-base p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="image-gen-title" className="font-display text-lg text-text-primary">
              生成图像
            </h3>
            <p className="text-ui-mono mt-1 text-xs text-text-muted">会基于素材描述生图，附加内容将一并记录</p>
            <label className="text-ui-mono mt-4 block text-xs text-text-muted" htmlFor="image-gen-extra">
              附加描述（可选）
            </label>
            <input
              id="image-gen-extra"
              className="mt-1 w-full border-b border-border bg-transparent py-2 text-sm outline-none focus:border-accent/60"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="如：夜景、近景、偏冷色调"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="text-ui-mono rounded border border-border px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
                onClick={() => setPanel(false)}
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy}
                className="text-ui-mono rounded bg-accent/20 px-3 py-1.5 text-sm text-accent disabled:opacity-50"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onRequestImage(extra.trim() || null);
                    setExtra("");
                    setPanel(false);
                    onRefresh();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "…" : "开始生成"}
              </button>
            </div>
          </div>
        </div>
      )}
      {lightbox && (
        <button
          type="button"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-md"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={imageDisplaySrc(lightbox.url, 1200)}
              alt=""
              width={1200}
              height={1200}
              className="max-h-[85vh] w-auto object-contain"
              unoptimized
            />
            <p className="text-ui-mono mt-2 text-left text-sm text-text-muted">
              附加：{lightbox.extraPrompt ?? "—"}
            </p>
          </div>
        </button>
      )}
      {list.length === 0 && showProceduralWhenEmpty && (
        <div className="flex h-40 items-center justify-center rounded-md border border-border/50 bg-surface/50">
          <div className="h-24 w-24 overflow-hidden rounded">
            <ProceduralPlaceholder seed={assetId} />
          </div>
        </div>
      )}
      {list.length === 0 && !showProceduralWhenEmpty && !canGenerate && (
        <p className="text-ui-mono text-sm text-text-muted/80">尚未添加图像</p>
      )}
    </div>
  );
}
