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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ThemeSelect } from "@/components/ui/ThemeSelect";

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
  const [discardOpen, setDiscardOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const isOwner = me != null && isAssetFull(asset) && me.id === asset.authorId;
  const canEditContent = isOwner && isAssetFull(asset);
  const isPrivateAsset = isAssetFull(asset) && asset.visibility === "private";

  useEffect(() => {
    if (!canEditContent) setEditingText(false);
  }, [canEditContent]);

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
    if (asset?.visibility === "deleted" || !isAssetFull(asset) || !canEditContent) return;
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
  }, [id, name, description, annotation, asset, canEditContent, qc]);

  const cancelEdit = useCallback(() => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    resetFormFromAsset();
    setEditingText(false);
    setSave("idle");
  }, [dirty, resetFormFromAsset]);

  useEffect(() => {
    if (!editingText || !canEditContent) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void saveText();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingText, canEditContent, saveText]);

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
  const showForkForPublicOther = full.visibility === "public" && me != null && !isOwner;

  const runFork = async () => {
    const f = await forkAsset(id);
    window.location.href = `/library/assets/${f.id}`;
  };

  const groupOptions: { value: string; label: string }[] = [
    { value: "", label: "未分组" },
    ...(groupList?.items.map((g) => ({ value: g.id, label: g.name })) ?? []),
  ];

  return (
    <div className="grid min-h-screen grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[minmax(0,45%)_1fr] lg:px-8">
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="放弃未保存的修改？"
        description="当前编辑尚未保存，确定要关闭吗？"
        confirmLabel="放弃"
        tone="danger"
        onConfirm={() => {
          resetFormFromAsset();
          setEditingText(false);
          setSave("idle");
        }}
      />
      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="发布到「探索」公开库？"
        description="确认后，本条将进入全站「探索」页，任何用户都可以浏览，与仅自己可见的私库素材不同。发布后会移出你的私库分组。你仍可更新展示用名称、描述与封面；若需仅自己生图或深度编辑，请先「复制到私库」。确定发布？"
        confirmLabel="发布到探索"
        onConfirm={async () => {
          await publishAsset(id);
          void refetch();
          void qc.invalidateQueries({ queryKey: ["assets"] });
        }}
      />

      <div className="space-y-4">
        <nav className="text-ui-mono text-xs text-text-muted/80">
          <Link href="/library/assets" className="hover:text-accent">
            我的库
          </Link>{" "}
          / <span className="text-text-primary">{name}</span>
        </nav>
        {canEditContent && editingText && (
          <p className="text-ui-mono min-h-4 text-xs text-text-muted/70">
            {save === "saving" && "正在保存…"}
            {save === "saved" && "已保存 · Ctrl+S 可再次保存"}
            {save === "err" && "保存失败"}
            {save === "idle" && "\u00a0"}
          </p>
        )}
        {full.visibility === "public" && isOwner && (
          <div className="space-y-2 rounded border border-border/50 bg-surface/50 p-3">
            <p className="text-ui-mono text-xs text-text-muted/90">
              <span className="text-text-primary/90">公开素材</span>：本条在「探索」中，<span className="text-text-primary/80">全站用户均可浏览</span>，与仅自己可见的私库草稿不是同一类东西。
              <span className="text-text-primary/80"> 它不再占用你的私库分组</span>。你仍可改展示用名称、描述与封面；生图、私库分组与深度编辑请用「复制到私库」得到仅自己可见的副本。
            </p>
            <button
              type="button"
              onClick={() => void runFork()}
              className="text-ui-mono rounded border border-accent/45 bg-accent/10 px-3 py-1.5 text-sm text-accent hover:border-accent/60"
            >
              复制到私库
            </button>
            <p className="text-ui-mono text-xs text-text-muted/60">
              私库副本仅你可见；完成后再选择发布到探索，或一直保留为私有。
            </p>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1
            className={cn(
              "font-display min-w-0 flex-1 text-3xl text-text-primary",
              !canEditContent && "cursor-default"
            )}
          >
            {canEditContent && editingText ? (
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
          {canEditContent && !editingText && (
            <button
              type="button"
              onClick={() => {
                setEditingText(true);
                setSave("idle");
              }}
              className="text-ui-mono inline-flex shrink-0 items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs text-text-muted hover:border-accent/40 hover:text-text-primary"
              title="编辑名称与描述"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              编辑
            </button>
          )}
          {canEditContent && editingText && (
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
        {isOwner && groupList && isPrivateAsset && (
          <div className="text-ui-mono text-sm">
            <p className="text-xs text-text-muted">分组</p>
            <div className="mt-1 max-w-xs">
              <ThemeSelect
                value={(full.groupId ?? "") as string}
                onValueChange={async (v) => {
                  await patchAsset(id, { groupId: v === "" ? null : v });
                  void refetch();
                  void qc.invalidateQueries({ queryKey: ["assets", "private"] });
                }}
                options={groupOptions}
                aria-label="素材分组"
              />
            </div>
          </div>
        )}
        {showPrivateActions && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPublishOpen(true)}
                className="text-ui-mono rounded border border-accent/40 bg-accent/10 px-3 py-1 text-sm text-accent"
              >
                发布到探索
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
            <p className="text-ui-mono text-xs text-text-muted/80">
              「发布到探索」后全站可见；「复制」仅在私库留一份仅自己可见的副本 (COPY)。
            </p>
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
            <p className="text-ui-mono text-xs text-text-muted/80">
              此为全站公开素材。Fork 到你的私库后，仅你可编辑、生图。
            </p>
          </div>
        )}
        <div>
          <p className="text-ui-mono text-xs text-text-muted">描述</p>
          {canEditContent && editingText ? (
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
        {canEditContent && editingText && (
          <div>
            <button
              type="button"
              onClick={() => setAnnOpen((o) => !o)}
              className="text-ui-mono text-xs text-text-muted hover:text-text-primary"
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
        {isOwner && !editingText && full.annotation && (
          <div>
            <p className="text-ui-mono text-xs text-text-muted">注释</p>
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
            if (!isOwner) return;
            await patchAsset(id, { coverImageId: imageId });
            void refetch();
          }}
          onRequestImage={async (extra) => {
            const { postImage } = await import("@/lib/api");
            return postImage(id, extra);
          }}
          canGenerate={isOwner && isPrivateAsset}
        />
      </div>
    </div>
  );
}
