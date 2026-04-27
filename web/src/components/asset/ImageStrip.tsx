"use client";

import { useState } from "react";
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

  return (
    <div className="space-y-3">
      <h2 className="text-ui-mono text-[11px] uppercase tracking-wider text-text-muted">图像（可选）</h2>
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
                  className="text-ui-mono text-[10px] text-accent"
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
            onClick={() => setPanel((p) => !p)}
            className="flex h-60 w-60 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-border text-text-muted hover:border-accent/40"
          >
            + 生图
          </button>
        )}
      </div>
      {panel && canGenerate && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg-base/95 p-4 shadow-lg">
          <p className="text-ui-mono text-[11px] text-text-muted">附加描述（会记录）</p>
          <div className="mt-2 flex gap-2">
            <input
              className="flex-1 border-b border-border bg-transparent py-2 text-sm outline-none focus:border-accent"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="可选"
            />
            <button
              type="button"
              disabled={busy}
              className="text-ui-mono rounded bg-accent/20 px-3 text-sm text-accent"
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
              {busy ? "…" : "生成"}
            </button>
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
            <p className="text-ui-mono mt-2 text-left text-[12px] text-text-muted">
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
