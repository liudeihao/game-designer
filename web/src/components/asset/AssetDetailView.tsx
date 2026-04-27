"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import type { Asset } from "@/lib/types";
import { isAssetFull } from "@/lib/guards";
import { patchAsset, publishAsset, forkAsset, getAsset, getMe, listAssetGroups } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ImageStrip } from "./ImageStrip";
import { ForkBadge, GhostHint } from "./ForkBadge";
import { ForkRelationPanel } from "./ForkRelationPanel";

export function AssetDetailView({ id, initial }: { id: string; initial: Asset }) {
  const qc = useQueryClient();
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    staleTime: 60_000,
  });
  const { data: groupList } = useQuery({
    queryKey: ["asset-groups"],
    queryFn: listAssetGroups,
    enabled: me != null,
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

  const [editingText, setEditingText] = useState(false);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "err">("idle");

  const isOwner = me != null && isAssetFull(asset) && me.id === asset.authorId;
  const canEdit = isOwner && asset.visibility === "private";

  useEffect(() => {
    if (!canEdit) setEditingText(false);
  }, [canEdit]);

  const dirty =
    isAssetFull(asset) &&
    (name !== asset.name ||
      description !== asset.description ||
      (annotation || "") !== (asset.annotation || ""));

  const resetFormFromAsset = useCallback(() => {
    if (!isAssetFull(asset)) return;
    setName(asset.name);
    setDescription(asset.description);
    setAnnotation(asset.annotation ?? "");
    setAnnOpen(!!asset.annotation);
  }, [asset]);

  const saveText = useCallback(async () => {
    if (asset?.visibility === "deleted" || !isAssetFull(asset) || !canEdit) return;
    setSave("saving");
    try {
      await patchAsset(id, {
        name,
        description,
        annotation: annotation || null,
      });
      setSave("saved");
      void qc.invalidateQueries({ queryKey: ["asset", id] });
      void qc.invalidateQueries({ queryKey: ["assets"] });
    } catch {
      setSave("err");
    }
  }, [id, name, description, annotation, asset, canEdit, qc]);

  const cancelEdit = useCallback(() => {
    if (dirty && !confirm("放弃未保存的修改？")) return;
    resetFormFromAsset();
    setEditingText(false);
    setSave("idle");
  }, [dirty, resetFormFromAsset]);

  useEffect(() => {
    if (!editingText || !canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void saveText();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingText, canEdit, saveText]);

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
        {canEdit && editingText && (
          <p className="text-ui-mono min-h-4 text-[10px] text-text-muted/70">
            {save === "saving" && "正在保存…"}
            {save === "saved" && "已保存 · Ctrl+S 可再次保存"}
            {save === "err" && "保存失败"}
            {save === "idle" && "\u00a0"}
          </p>
        )}
        {full.visibility === "public" && isOwner && (
          <p className="text-ui-mono text-[11px] text-text-muted/90">已公开 · 内容不可再修改，仅展示</p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className={cn("font-display min-w-0 flex-1 text-3xl text-text-primary", !canEdit && "cursor-default")}>
            {canEdit && editingText ? (
              <input
                className="w-full border-b border-border/60 bg-transparent pb-1 outline-none focus:border-accent/50"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSave("idle");
                }}
                placeholder="名称"
                aria-label="素材名称"
              />
            ) : (
              <span className="block">{full.name}</span>
            )}
          </h1>
          {canEdit && !editingText && (
            <button
              type="button"
              onClick={() => {
                setEditingText(true);
                setSave("idle");
              }}
              className="text-ui-mono inline-flex shrink-0 items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-[11px] text-text-muted hover:border-accent/40 hover:text-text-primary"
              title="编辑名称与描述"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              编辑
            </button>
          )}
          {canEdit && editingText && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void saveText()}
                disabled={!dirty}
                className="text-ui-mono rounded border border-accent/50 bg-accent/10 px-3 py-1.5 text-sm text-accent disabled:opacity-40"
              >
                保存
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="text-ui-mono rounded border border-border px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
              >
                取消
              </button>
            </div>
          )}
        </div>
        <ForkBadge asset={full} />
        {canEdit && groupList && (
          <div className="text-ui-mono text-[12px]">
            <label htmlFor="asset-group" className="text-[10px] text-text-muted">
              分组
            </label>
            <select
              id="asset-group"
              className="mt-1 block w-full max-w-xs rounded border border-border/60 bg-surface/60 px-2 py-1.5 text-sm"
              value={full.groupId ?? ""}
              onChange={async (e) => {
                const v = e.target.value;
                await patchAsset(id, { groupId: v === "" ? null : v });
                void refetch();
                void qc.invalidateQueries({ queryKey: ["assets", "private"] });
              }}
            >
              <option value="">未分组</option>
              {groupList.items.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}
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
          {canEdit && editingText ? (
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
        {canEdit && editingText && (
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
