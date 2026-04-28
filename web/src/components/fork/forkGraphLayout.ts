import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";

/** Square tiles aligned with grid AssetCard proportions (fixed edge for dagre). */
export const FORK_NODE_WIDTH = 168;
export const FORK_NODE_HEIGHT = 168;

/** Left-to-right tree; dagre uses node center, React Flow uses top-left. */
export function layoutForkNodes(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 56, marginx: 28, marginy: 28 });
  for (const n of nodes) {
    g.setNode(n.id, { width: FORK_NODE_WIDTH, height: FORK_NODE_HEIGHT });
  }
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }
  dagre.layout(g);
  return nodes.map((node) => {
    const pos = g.node(node.id);
    if (!pos) {
      return { ...node, position: { x: 0, y: 0 } };
    }
    return {
      ...node,
      position: {
        x: pos.x - FORK_NODE_WIDTH / 2,
        y: pos.y - FORK_NODE_HEIGHT / 2,
      },
    };
  });
}
