"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Asset } from "@/lib/types";
import { isAssetFull } from "@/lib/guards";
import { patchAsset, publishAsset, forkAsset, getAsset, getMe } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ImageStrip } from "./ImageStrip";
import { ForkBadge, GhostHint } from "./ForkBadge";
import { ForkRelationPanel } from "./ForkRelationPanel";

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
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    staleTime: 60_000,
  });
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

  const isOwner = me != null && isAssetFull(asset) && me.id === asset.authorId;
  const canEdit = isOwner && asset.visibility === "private";

  const persist = useCallback(async () => {
    if (asset?.visibility === "deleted" || !isAssetFull(asset) || !canEdit) return;
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
  }, [id, dName, dDesc, dAnn, asset, canEdit, qc]);

  useEffect(() => {
    if (!isAssetFull(asset) || !canEdit) return;
    if (dName === asset.name && dDesc === asset.description && (dAnn || "") === (asset.annotation || "")) return;
    void persist();
  }, [dName, dDesc, dAnn, asset, canEdit, persist]);

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
  const showPrivateActions = full.visibility === "private" && isOwner;
  const showForkForPublicOther =
    full.visibility === "public" && me != null && !isOwner;

  const runFork = async () => {
    const f = await forkAsset(id);
    window.location.href = `/library/assets/${f.id}`;
  };

  return (
    <div className="grid min-h-screen grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,45%)_1fr] lg:px-8">
      <div className="space-y-4">
        <nav className="text-ui-mono text-[11px] text-text-muted/80">
          <Link href="/library/assets" className="hover:text-accent">
            我的库
          </Link>{" "}
          / <span className="text-text-primary">{name}</span>
        </nav>
        {canEdit && (
          <p className="text-ui-mono h-4 text-[10px] text-text-muted/70">
            {save === "saving" && "正在保存…"}
            {save === "saved" && "已保存"}
            {save === "err" && "保存失败"}
            {save === "idle" && "\u00a0"}
          </p>
        )}
        {full.visibility === "public" && isOwner && (
          <p className="text-ui-mono text-[11px] text-text-muted/90">已公开 · 内容不可再修改，仅展示</p>
        )}
        <h1 className={cn("font-display text-3xl text-text-primary", !canEdit && "cursor-default")}>
          {canEdit ? (
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
        {showPrivateActions && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("公开后内容不可在公开区修改。确定？")) return;
                  await publishAsset(id);
                  void refetch();
                  void qc.invalidateQueries({ queryKey: ["assets"] });
                }}
                className="text-ui-mono rounded border border-accent/40 bg-accent/10 px-3 py-1 text-sm text-accent"
              >
                公开
              </button>
              <button
                type="button"
                onClick={() => void runFork()}
                className="text-ui-mono rounded border border-border px-3 py-1 text-sm"
                title="复制到私库为副本"
              >
                复制
              </button>
            </div>
            <p className="text-ui-mono text-[10px] text-text-muted/80">「复制」在私库创建副本 (COPY)。</p>
          </div>
        )}
        {showForkForPublicOther && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => void runFork()}
              className="text-ui-mono w-fit rounded border border-accent/40 bg-accent/10 px-3 py-1 text-sm text-accent"
            >
              Fork 到私库
            </button>
            <p className="text-ui-mono text-[10px] text-text-muted/80">Fork 后可在你的私库中编辑、生图。</p>
          </div>
        )}
        <div>
          <p className="text-ui-mono text-[10px] text-text-muted">描述</p>
          {canEdit ? (
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
        {canEdit && (
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
        {isOwner && full.visibility === "public" && full.annotation && (
          <div>
            <p className="text-ui-mono text-[10px] text-text-muted">注释（已冻结）</p>
            <p className="mt-1 text-sm text-text-muted/90">{full.annotation}</p>
          </div>
        )}
        <ForkRelationPanel assetId={id} />
      </div>
      <div>
        <ImageStrip
          assetId={id}
          images={full.images}
          coverImageId={full.coverImageId}
          onRefresh={() => void refetch()}
          onSetCover={async (imageId) => {
            if (!canEdit) return;
            await patchAsset(id, { coverImageId: imageId });
            void refetch();
          }}
          onRequestImage={async (extra) => {
            const { postImage } = await import("@/lib/api");
            return postImage(id, extra);
          }}
          canGenerate={canEdit}
        />
      </div>
    </div>
  );
}
