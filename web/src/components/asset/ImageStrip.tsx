"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { AssetImage } from "@/lib/types";
import { ProceduralPlaceholder } from "./ProceduralPlaceholder";
import { StatusDot } from "./StatusDot";
import { cn } from "@/lib/utils";

export function ImageStrip({
  assetId,
  images,
  coverImageId,
  onRefresh,
  onSetCover,
  onRequestImage,
  canGenerate,
}: {
  assetId: string;
  /** May be null/undefined from API when no images; treat as none. */
  images: AssetImage[] | null | undefined;
  coverImageId: string | null;
  onRefresh: () => void;
  onSetCover: (imageId: string | null) => Promise<void>;
  onRequestImage: (extra: string | null) => Promise<AssetImage>;
  canGenerate: boolean;
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
      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {list.map((im) => (
          <button
            key={im.id}
            type="button"
            onClick={() => setLightbox(im)}
            className={cn(
              "relative h-60 w-60 shrink-0 overflow-hidden rounded-md border bg-surface text-left",
              coverImageId === im.id ? "border-accent" : "border-border"
            )}
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
                src={im.url.includes("?") ? im.url : `${im.url}?w=800`}
                alt=""
                fill
                className="object-cover"
                unoptimized
              />
            )}
            <div className="absolute bottom-0 left-0 right-0 flex justify-between bg-bg-base/80 p-1">
              {canGenerate && (
                <span
                  role="button"
                  tabIndex={0}
                  className="text-ui-mono text-xs text-accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onSetCover(im.id);
                  }}
                >
                  封面
                </span>
              )}
            </div>
          </button>
        ))}
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
              src={lightbox.url.includes("?") ? lightbox.url : `${lightbox.url}?w=1200`}
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
      {list.length === 0 && (
        <div className="flex h-40 items-center justify-center rounded-md border border-border/50 bg-surface/50">
          <div className="h-24 w-24 overflow-hidden rounded">
            <ProceduralPlaceholder seed={assetId} />
          </div>
        </div>
      )}
    </div>
  );
}
