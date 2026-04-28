import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";

export const FORK_NODE_WIDTH = 220;
export const FORK_NODE_HEIGHT = 108;

/** Top-bottom tree layout; dagre uses node center, React Flow uses top-left. */
export function layoutForkNodes(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 44, ranksep: 72, marginx: 24, marginy: 24 });
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
