"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { getAssets, getProject, patchProject } from "@/lib/api";
import { isAssetFull } from "@/lib/guards";
import type { ProjectDetail } from "@/lib/types";
import { createShapeId, parseTldrawJsonFile, useEditor, serializeTldrawJson } from "tldraw";
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

function InCanvasAssetPanel() {
  const editor = useEditor();
  const { data, isSuccess } = useQuery({
    queryKey: ["assets", "private", "all", "all", ""],
    queryFn: () => getAssets("private", null, 100),
  });
  const place = useCallback(
    (assetId: string) => {
      const id = createShapeId();
      editor.createShape({
        id,
        type: "geo",
        x: 120 + Math.random() * 80,
        y: 120 + Math.random() * 80,
        props: {
          geo: "rectangle",
          w: 200,
          h: 220,
          color: "light-blue",
          labelColor: "black",
          fill: "solid",
          dash: "draw",
          size: "s",
        },
        meta: { assetId, type: "asset-node", lockedOnCanvas: false },
      });
    },
    [editor]
  );

  if (!isSuccess) return <div className="text-ui-mono p-2 text-[11px] text-text-muted">加载素材…</div>;
  return (
    <div className="gd-scrollbar text-ui-mono max-h-[60vh] w-64 overflow-y-auto rounded border border-border bg-bg-base/95 p-2 text-[11px] text-text-primary shadow-lg">
      <p className="text-[10px] uppercase text-text-muted">私人库 · 点击放置（形状 meta.assetId）</p>
      <ul className="mt-2 space-y-1">
        {data.items.map((a) => {
          if (!isAssetFull(a)) return null;
          return (
            <li key={a.id}>
              <button
                type="button"
                className="w-full text-left text-accent/90 hover:underline"
                onClick={() => place(a.id)}
              >
                {a.name}
              </button>
            </li>
          );
        })}
      </ul>
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
}: {
  projectId: string;
  canvasDocument: Record<string, unknown> | null;
}) {
  return (
    <>
      <HydrateFromServer canvasDocument={canvasDocument} />
      <PersistenceBridge projectId={projectId} />
      <div className="pointer-events-none absolute left-2 top-14 z-[200]">
        <div className="pointer-events-auto">
          <InCanvasAssetPanel />
        </div>
      </div>
    </>
  );
}

export function ProjectCanvasLoader({ id, embedded }: { id: string; embedded?: boolean }) {
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
        components={{
          InFrontOfTheCanvas: () => (
            <CanvasInner projectId={id} canvasDocument={detail.canvasDocument as Record<string, unknown> | null} />
          ),
        }}
      />
    </div>
  );
}
