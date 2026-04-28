"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { getForkGraph } from "@/lib/api";
import type { ForkGraphNode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ForkAssetNode } from "./ForkAssetNode";
import { FORK_NODE_HEIGHT, FORK_NODE_WIDTH, layoutForkNodes } from "./forkGraphLayout";

function mergeById(base: ForkGraphNode[], patch: ForkGraphNode[]): ForkGraphNode[] {
  const m = new Map<string, ForkGraphNode>();
  for (const n of base) m.set(n.id, n);
  for (const n of patch) m.set(n.id, n);
  return [...m.values()];
}

const nodeTypes = { forkAsset: ForkAssetNode };

function ForkGraphToolbar({ focusAssetId }: { focusAssetId: string }) {
  const router = useRouter();
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  return (
    <Panel position="top-right" className="m-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        title="放大"
        onClick={() => zoomIn()}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-surface/95 text-text-primary hover:bg-white/5"
      >
        <ZoomIn className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="缩小"
        onClick={() => zoomOut()}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-surface/95 text-text-primary hover:bg-white/5"
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="适应画布"
        onClick={() => void fitView({ padding: 0.2, maxZoom: 1.25 })}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-surface/95 text-text-primary hover:bg-white/5"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="返回素材（Esc）"
        onClick={() => router.push(`/library/assets/${encodeURIComponent(focusAssetId)}`)}
        className="flex items-center gap-1.5 rounded-md border border-border/70 bg-surface/95 px-3 py-2 text-ui-mono text-xs text-text-primary hover:bg-white/5"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回素材
      </button>
    </Panel>
  );
}

/** Runs inside ReactFlow so useReactFlow is bound to the store. */
function FitViewOnce({ nodeCount, querySuccess }: { nodeCount: number; querySuccess: boolean }) {
  const { fitView } = useReactFlow();
  const fittedRef = useRef(false);
  useEffect(() => {
    if (!querySuccess || !nodeCount || fittedRef.current) return;
    fittedRef.current = true;
    const id = requestAnimationFrame(() => {
      void fitView({ padding: 0.15, duration: 200, maxZoom: 1.25 });
    });
    return () => cancelAnimationFrame(id);
  }, [querySuccess, nodeCount, fitView]);
  return null;
}

function ForkFlowBody({ focusAssetId }: { focusAssetId: string }) {
  const router = useRouter();
  const [patchList, setPatchList] = useState<ForkGraphNode[]>([]);
  const [expandingId, setExpandingId] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const q = useQuery({
    queryKey: ["fork-graph", focusAssetId],
    queryFn: ({ signal }) => getForkGraph(focusAssetId, { signal, downstreamDepth: 2 }),
  });

  const merged = useMemo(() => mergeById(q.data?.nodes ?? [], patchList), [q.data?.nodes, patchList]);

  const handleExpand = useCallback(async (parentId: string) => {
    setExpandingId(parentId);
    try {
      const res = await getForkGraph(focusAssetId, { expandFrom: parentId });
      setPatchList((prev) => mergeById(prev, res.nodes));
    } catch {
      /* optional: toast */
    } finally {
      setExpandingId(null);
    }
  }, [focusAssetId]);

  const { nextNodes, nextEdges } = useMemo(() => {
    const idSet = new Set(merged.map((n) => n.id));
    const e: Edge[] = [];
    for (const n of merged) {
      if (n.forkedFromId && idSet.has(n.forkedFromId)) {
        e.push({
          id: `${n.forkedFromId}-${n.id}`,
          source: n.forkedFromId,
          target: n.id,
        });
      }
    }
    const childCountByParent = new Map<string, number>();
    for (const edge of e) {
      childCountByParent.set(edge.source, (childCountByParent.get(edge.source) ?? 0) + 1);
    }
    const rf: Node[] = merged.map((n) => ({
      id: n.id,
      type: "forkAsset",
      position: { x: 0, y: 0 },
      data: {
        graph: n,
        isFocus: n.id === focusAssetId,
        childCount: childCountByParent.get(n.id) ?? 0,
        expanding: expandingId === n.id,
        onExpand: () => void handleExpand(n.id),
      },
      width: FORK_NODE_WIDTH,
      height: FORK_NODE_HEIGHT,
    }));
    return { nextNodes: layoutForkNodes(rf, e), nextEdges: e };
  }, [merged, focusAssetId, expandingId, handleExpand]);

  useLayoutEffect(() => {
    setNodes(nextNodes);
    setEdges(nextEdges);
  }, [nextNodes, nextEdges, setNodes, setEdges]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      router.push(`/library/assets/${encodeURIComponent(focusAssetId)}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, focusAssetId]);

  const showInitialLoading = q.isPending && !q.data;
  const showRefetchOverlay = q.isFetching && !q.isPending && q.data;

  if (q.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-text-muted">无法加载 fork 图</p>
        <button
          type="button"
          className="text-ui-mono text-accent hover:underline"
          onClick={() => void q.refetch()}
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {showInitialLoading ? (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-bg-base/80 backdrop-blur-sm"
          aria-busy="true"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/50 border-t-transparent" />
          <p className="text-ui-mono text-sm text-text-muted">正在加载 fork 关系…</p>
        </div>
      ) : null}
      {showRefetchOverlay ? (
        <div
          className="pointer-events-none absolute left-1/2 top-14 z-10 -translate-x-1/2 rounded-md border border-border/60 bg-surface/90 px-3 py-1.5 text-ui-mono text-xs text-text-muted"
          aria-live="polite"
        >
          更新中…
        </div>
      ) : null}
      {q.data ? (
        <>
          {q.data.truncated ? (
            <div className="absolute left-3 top-12 z-10 max-w-sm rounded-md border border-border/60 bg-surface/90 px-3 py-2 text-ui-mono text-xs leading-snug text-text-muted backdrop-blur-sm">
              图在服务器侧已截断。可在节点上点击加载更多子分支。
            </div>
          ) : null}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={{ type: "smoothstep" }}
            nodesDraggable={false}
            nodesConnectable={false}
            minZoom={0.06}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            className="min-h-0 flex-1 bg-bg-base/30"
          >
            <FitViewOnce nodeCount={nodes.length} querySuccess={q.isSuccess} />
            <Background gap={22} size={1} color="var(--color-border)" />
            <Controls showInteractive={false} className="!bg-surface/90 !border-border/60" />
            <MiniMap
              className="!bg-surface/90 !border-border/60"
              maskColor="rgba(0,0,0,0.1)"
              nodeColor={() => "var(--color-accent)"}
            />
            <ForkGraphToolbar focusAssetId={focusAssetId} />
          </ReactFlow>
        </>
      ) : null}
    </div>
  );
}

export function ForkTreePageClient({ focusAssetId }: { focusAssetId: string }) {
  return (
    <ReactFlowProvider>
      <div className={cn("flex h-full min-h-0 w-full min-w-0 flex-1 flex-col")}>
        <ForkFlowBody key={focusAssetId} focusAssetId={focusAssetId} />
      </div>
    </ReactFlowProvider>
  );
}
