"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useUiPreferences } from "@/components/providers/UiPreferencesProvider";
import { getProject, patchProject } from "@/lib/api";
import type { ProjectDetail, ProjectLinkedAsset } from "@/lib/types";
import type { Editor, TLImageAsset } from "tldraw";
import {
  AssetRecordType,
  createShapeId,
  createShapesForAssets,
  getHashForString,
  parseTldrawJsonFile,
  serializeTldrawJson,
  toRichText,
  useEditor,
  useValue,
} from "tldraw";
import "tldraw/tldraw.css";

const Tldraw = dynamic(async () => (await import("tldraw")).Tldraw, { ssr: false });

function isSavedTldrawFile(doc: unknown): doc is Record<string, unknown> {
  if (!doc || typeof doc !== "object") return false;
  const o = doc as Record<string, unknown>;
  if (typeof o.tldrawFileFormatVersion === "number") return true;
  if (o.schema != null && Array.isArray(o.records)) return true;
  return false;
}

/** Load server-persisted .tldraw JSON (same shape as serializeTldrawJson output) into the editor. */
function HydrateFromServer({ canvasDocument }: { canvasDocument: Record<string, unknown> | null }) {
  const editor = useEditor();
  const attempted = useRef(false);

  useLayoutEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    if (!isSavedTldrawFile(canvasDocument)) return;
    const result = parseTldrawJsonFile({
      json: JSON.stringify(canvasDocument),
      schema: editor.store.schema,
    });
    if (!result.ok) return;
    const snapshot = result.value.getStoreSnapshot();
    editor.loadSnapshot(snapshot);
    editor.clearHistory();
  }, [editor, canvasDocument]);

  return null;
}

const PLACE_BOX_MAX = 280;

function firstLabelChar(name: string): string {
  const s = name.trim();
  if (!s) return "?";
  const ch = [...s][0];
  return ch ?? "?";
}

function guessMimeFromUrl(url: string): string | null {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  return null;
}

function fitInsideMaxBox(nw: number, nh: number, maxW: number, maxH: number) {
  const safeW = Math.max(1, nw);
  const safeH = Math.max(1, nh);
  const r = Math.min(maxW / safeW, maxH / safeH, 1);
  return {
    w: Math.max(48, Math.round(safeW * r)),
    h: Math.max(48, Math.round(safeH * r)),
  };
}

function measureImageNaturalSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        w: img.naturalWidth || 240,
        h: img.naturalHeight || 180,
      });
    img.onerror = () => resolve({ w: 240, h: 180 });
    img.src = url;
  });
}

async function placeLinkedAssetOnCanvas(editor: Editor, linked: ProjectLinkedAsset, pagePoint: { x: number; y: number }) {
  const url = linked.coverImageUrl?.trim() || null;

  if (url) {
    const natural = await measureImageNaturalSize(url);
    const { w, h } = fitInsideMaxBox(natural.w, natural.h, PLACE_BOX_MAX, PLACE_BOX_MAX);
    const hash = getHashForString(`gd:${linked.id}:${url}`);
    const assetId = AssetRecordType.createId(hash);
    const asset: TLImageAsset = {
      id: assetId,
      type: "image",
      typeName: "asset",
      props: {
        name: linked.name,
        src: url,
        w,
        h,
        mimeType: guessMimeFromUrl(url),
        isAnimated: false,
      },
      meta: {},
    };
    const shapeIds = await createShapesForAssets(editor, [asset], pagePoint);
    for (const sid of shapeIds) {
      const sh = editor.getShape(sid);
      if (!sh) continue;
      editor.updateShape({
        id: sid,
        type: sh.type,
        meta: { ...(sh.meta ?? {}), assetId: linked.id, type: "asset-node", lockedOnCanvas: false },
      });
    }
    return;
  }

  const label = firstLabelChar(linked.name);
  const gw = 200;
  const gh = 220;
  editor.createShape({
    id: createShapeId(),
    type: "geo",
    x: pagePoint.x - gw / 2,
    y: pagePoint.y - gh / 2,
    props: {
      geo: "rectangle",
      w: gw,
      h: gh,
      color: "light-blue",
      labelColor: "black",
      fill: "solid",
      dash: "solid",
      size: "s",
      richText: toRichText(label),
    },
    meta: { assetId: linked.id, type: "asset-node", lockedOnCanvas: false },
  });
}

/** Group / ungroup for canvas-only hierarchy (persisted in project canvasDocument). */
function CanvasShapeGroupBar() {
  const editor = useEditor();
  const selectedIds = useValue("canvas-shape-selection", () => editor.getSelectedShapeIds(), [editor]);
  const canGroup = selectedIds.length >= 2;
  const groupShapeIds = selectedIds.filter((id) => editor.getShape(id)?.type === "group");
  const canUngroup = groupShapeIds.length >= 1;

  return (
    <div className="mt-2 border-t border-border/40 pt-2">
      <p className="text-[10px] leading-snug text-text-muted">
        画布内可将多个形状<strong className="text-text-primary/90">组合</strong>（仅保存在本情绪板，不影响素材库或其它项目）。多选后点下方按钮，或使用{" "}
        <kbd className="rounded border border-border/60 bg-surface/50 px-0.5 font-mono text-[9px]">⌘G</kbd>{" "}
        /{" "}
        <kbd className="rounded border border-border/60 bg-surface/50 px-0.5 font-mono text-[9px]">
          Ctrl+G
        </kbd>
        。
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={!canGroup}
          className="rounded border border-border/70 bg-surface/40 px-2 py-1 text-[11px] text-text-primary hover:border-accent/35 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => editor.groupShapes(selectedIds)}
        >
          组合选中
        </button>
        <button
          type="button"
          disabled={!canUngroup}
          className="rounded border border-border/70 bg-surface/40 px-2 py-1 text-[11px] text-text-primary hover:border-accent/35 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => editor.ungroupShapes(groupShapeIds)}
        >
          拆分组合
        </button>
      </div>
    </div>
  );
}

function InCanvasAssetPanel({ linkedAssets }: { linkedAssets: ProjectLinkedAsset[] }) {
  const editor = useEditor();

  const defaultPagePoint = useCallback(() => {
    const b = editor.getViewportPageBounds();
    return { x: b.center.x + (Math.random() - 0.5) * 120, y: b.center.y + (Math.random() - 0.5) * 120 };
  }, [editor]);

  const placeAt = useCallback(
    (linked: ProjectLinkedAsset, pagePoint: { x: number; y: number }) => {
      void placeLinkedAssetOnCanvas(editor, linked, pagePoint);
    },
    [editor]
  );

  return (
    <div className="gd-scrollbar text-ui-mono max-h-[min(78vh,calc(100dvh-4.5rem))] w-[min(20rem,calc(100vw-1rem))] overflow-y-auto rounded border border-border bg-bg-base/95 p-2 text-xs text-text-primary shadow-lg backdrop-blur-sm">
      <p className="text-[10px] uppercase leading-tight text-text-muted">项目引用素材 · 拖入画布或点击</p>
      {linkedAssets.length === 0 ? (
        <p className="mt-2 text-[11px] leading-snug text-text-muted">
          暂无引用。请在设计页左侧「关联素材」将私人库素材加入本项目后，再在此处使用。
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {linkedAssets.map((a) => {
            const ch = firstLabelChar(a.name);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData("application/x-gd-asset-id", a.id);
                  }}
                  onDragEnd={(e) => {
                    const container = editor.getContainer();
                    const r = container.getBoundingClientRect();
                    if (
                      e.clientX < r.left ||
                      e.clientX > r.right ||
                      e.clientY < r.top ||
                      e.clientY > r.bottom
                    ) {
                      return;
                    }
                    const p = editor.screenToPage({ x: e.clientX, y: e.clientY });
                    placeAt(a, { x: p.x, y: p.y });
                  }}
                  className="flex w-full cursor-grab items-start gap-2 rounded border border-border/60 bg-bg-elevated/40 p-1.5 text-left transition-colors hover:border-accent/40 active:cursor-grabbing"
                  onClick={() => placeAt(a, defaultPagePoint())}
                >
                  {a.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- thumbnail from our API / signed URL
                    <img
                      src={a.coverImageUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded object-cover"
                      draggable={false}
                    />
                  ) : (
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-accent/15 text-sm font-medium text-accent"
                      aria-hidden
                    >
                      {ch}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[11px] font-medium text-text-primary">{a.name}</span>
                    {a.description.trim() ? (
                      <span className="mt-0.5 line-clamp-2 block text-[10px] leading-snug text-text-muted">
                        {a.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <CanvasShapeGroupBar />
    </div>
  );
}

function PersistenceBridge({ projectId }: { projectId: string }) {
  const editor = useEditor();
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allowSave = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      allowSave.current = true;
    }, 900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    return editor.store.listen(
      () => {
        if (!allowSave.current) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          void (async () => {
            const raw = await serializeTldrawJson(editor);
            const json = JSON.parse(raw) as Record<string, unknown>;
            await patchProject(projectId, { canvasDocument: json });
            void qc.invalidateQueries({ queryKey: ["project", projectId] });
          })();
        }, 1500);
      },
      { source: "user", scope: "document" }
    );
  }, [editor, projectId, qc]);

  return null;
}

function CanvasInner({
  projectId,
  canvasDocument,
  linkedAssets,
}: {
  projectId: string;
  canvasDocument: Record<string, unknown> | null;
  linkedAssets: ProjectLinkedAsset[];
}) {
  return (
    <>
      <HydrateFromServer canvasDocument={canvasDocument} />
      <PersistenceBridge projectId={projectId} />
      <div className="pointer-events-none absolute right-2 top-14 z-[200]">
        <div className="pointer-events-auto">
          <InCanvasAssetPanel linkedAssets={linkedAssets} />
        </div>
      </div>
    </>
  );
}

export function ProjectCanvasLoader({ id, embedded }: { id: string; embedded?: boolean }) {
  const { prefs } = useUiPreferences();
  const editorRef = useRef<Editor | null>(null);
  const colorScheme = prefs.colorScheme;

  const onTldrawMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      editor.user.updateUserPreferences({ colorScheme });
    },
    [colorScheme]
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.user.updateUserPreferences({ colorScheme });
  }, [colorScheme]);

  const { data, isError } = useQuery({ queryKey: ["project", id], queryFn: () => getProject(id) });
  if (isError) {
    return (
      <p className="p-4 text-text-muted">
        无法加载项目。{" "}
        <Link href="/projects" className="text-accent">
          返回
        </Link>
      </p>
    );
  }
  if (!data) {
    return <p className="p-4 text-ui-mono text-text-muted">加载中…</p>;
  }
  const detail = data as ProjectDetail;

  return (
    <div className={embedded ? "h-full min-h-0 w-full" : "h-[100dvh] w-full"}>
      <Tldraw
        onMount={onTldrawMount}
        components={{
          InFrontOfTheCanvas: () => (
            <CanvasInner
              projectId={id}
              canvasDocument={detail.canvasDocument as Record<string, unknown> | null}
              linkedAssets={detail.linkedAssets ?? []}
            />
          ),
        }}
      />
    </div>
  );
}
