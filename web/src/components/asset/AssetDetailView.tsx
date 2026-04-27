"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Asset } from "@/lib/types";
import { isAssetFull } from "@/lib/guards";
import { patchAsset, publishAsset, forkAsset, getAsset } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ImageStrip } from "./ImageStrip";
import { ForkBadge, GhostHint } from "./ForkBadge";

function useDebounced<T>(value: T, delay: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function AssetDetailView({ id, initial }: { id: string; initial: Asset }) {
  const qc = useQueryClient();
  const { data: asset = initial, refetch } = useQuery({
    queryKey: ["asset", id],
    queryFn: async () => {
      const a = await getAsset(id);
      return a ?? initial;
    },
    initialData: initial,
  });

  const [name, setName] = useState(isAssetFull(asset) ? asset.name : "");
  const [description, setDescription] = useState(isAssetFull(asset) ? asset.description : "");
  const [annotation, setAnnotation] = useState(isAssetFull(asset) ? asset.annotation ?? "" : "");
  const [annOpen, setAnnOpen] = useState(!!(isAssetFull(asset) && asset.annotation));

  useEffect(() => {
    if (isAssetFull(asset)) {
      setName(asset.name);
      setDescription(asset.description);
      setAnnotation(asset.annotation ?? "");
    }
  }, [asset]);

  const dName = useDebounced(name, 800);
  const dDesc = useDebounced(description, 800);
  const dAnn = useDebounced(annotation, 800);

  const [save, setSave] = useState<"idle" | "saving" | "saved" | "err">("idle");

  const persist = useCallback(async () => {
    if (asset?.visibility === "deleted" || !isAssetFull(asset)) return;
    if (asset.authorId !== "user-1") return;
    setSave("saving");
    try {
      await patchAsset(id, {
        name: dName,
        description: dDesc,
        annotation: dAnn || null,
      });
      setSave("saved");
      void qc.invalidateQueries({ queryKey: ["asset", id] });
      void qc.invalidateQueries({ queryKey: ["assets"] });
    } catch {
      setSave("err");
    }
  }, [id, dName, dDesc, dAnn, asset, qc]);

  useEffect(() => {
    if (!isAssetFull(asset) || asset.authorId !== "user-1") return;
    if (dName === asset.name && dDesc === asset.description && (dAnn || "") === (asset.annotation || "")) return;
    void persist();
  }, [dName, dDesc, dAnn, asset, persist]);

  if (!asset) return <p>未找到</p>;

  if (asset.visibility === "deleted") {
    return (
      <div className="px-6 py-10">
        <p className="text-ui-mono text-text-muted">该素材已删除，仅保留溯源信息</p>
        {asset.forkedFromId && <GhostHint forkedFromId={asset.forkedFromId} />}
        <Link href="/explore" className="text-ui-mono mt-4 inline-block text-accent">
          返回探索
        </Link>
      </div>
    );
  }

  const full = asset;
  const isOwner = full.authorId === "user-1";
  return (
    <div className="grid min-h-screen grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,45%)_1fr] lg:px-8">
      <div className="space-y-4">
        <nav className="text-ui-mono text-[11px] text-text-muted/80">
          <Link href="/library/assets" className="hover:text-accent">
            我的库
          </Link>{" "}
          / <span className="text-text-primary">{name}</span>
        </nav>
        {isOwner && (
          <p className="text-ui-mono h-4 text-[10px] text-text-muted/70">
            {save === "saving" && "正在保存…"}
            {save === "saved" && "已保存"}
            {save === "err" && "保存失败"}
            {save === "idle" && "\u00a0"}
          </p>
        )}
        <h1 className={cn("font-display text-3xl text-text-primary", !isOwner && "cursor-default")}>
          {isOwner ? (
            <input
              className="w-full border-none bg-transparent outline-none"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSave("idle");
              }}
            />
          ) : (
            full.name
          )}
        </h1>
        <ForkBadge asset={full} />
        {full.visibility === "private" && isOwner && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                if (!confirm("公开后内容不可在公开区修改。确定？")) return;
                await publishAsset(id);
                void refetch();
              }}
              className="text-ui-mono rounded border border-accent/40 bg-accent/10 px-3 py-1 text-sm text-accent"
            >
              公开
            </button>
            <button
              type="button"
              onClick={async () => {
                const f = await forkAsset(id);
                window.location.href = `/library/assets/${f.id}`;
              }}
              className="text-ui-mono rounded border border-border px-3 py-1 text-sm"
            >
              Fork
            </button>
          </div>
        )}
        <div>
          <p className="text-ui-mono text-[10px] text-text-muted">描述</p>
          {isOwner ? (
            <textarea
              className="mt-1 w-full min-h-32 bg-surface/60 p-2 text-sm text-text-primary outline-none"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setSave("idle");
              }}
            />
          ) : (
            <p className="mt-1 text-sm text-text-primary/90">{full.description}</p>
          )}
        </div>
        {isOwner && (
          <div>
            <button
              type="button"
              onClick={() => setAnnOpen((o) => !o)}
              className="text-ui-mono text-[11px] text-text-muted hover:text-text-primary"
            >
              注释 {annOpen ? "▼" : "▶"}（不参与生图）
            </button>
            {annOpen && (
              <textarea
                className="mt-1 w-full min-h-20 bg-surface/40 p-2 text-sm text-text-muted outline-none"
                value={annotation}
                onChange={(e) => {
                  setAnnotation(e.target.value);
                  setSave("idle");
                }}
                placeholder="仅个人备注"
              />
            )}
          </div>
        )}
      </div>
      <div>
        <ImageStrip
          assetId={id}
          images={full.images}
          coverImageId={full.coverImageId}
          onRefresh={() => void refetch()}
          onSetCover={async (imageId) => {
            if (!isOwner) return;
            await patchAsset(id, { coverImageId: imageId });
            void refetch();
          }}
          onRequestImage={async (extra) => {
            const { postImage } = await import("@/lib/api");
            return postImage(id, extra);
          }}
          canGenerate={isOwner && full.visibility === "private"}
        />
      </div>
    </div>
  );
}
