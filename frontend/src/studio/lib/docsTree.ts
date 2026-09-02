import { isHiddenDocsPath, normalizeDocsPath } from "./docsPaths";

export type DocsDirNode = {
  kind: "dir";
  name: string;
  /** Directory path relative to docs root (empty = root). */
  path: string;
  children: DocsTreeNode[];
};

export type DocsFileNode = {
  kind: "file";
  name: string;
  /** File path relative to docs root, e.g. systems/economy.md */
  path: string;
};

export type DocsTreeNode = DocsDirNode | DocsFileNode;

function ensureDir(root: DocsDirNode, parts: string[]): DocsDirNode {
  let node = root;
  let built = "";
  for (const part of parts) {
    built = built ? `${built}/${part}` : part;
    let next = node.children.find(
      (c): c is DocsDirNode => c.kind === "dir" && c.name === part,
    );
    if (!next) {
      next = { kind: "dir", name: part, path: built, children: [] };
      node.children.push(next);
    }
    node = next;
  }
  return node;
}

function sortTree(nodes: DocsTreeNode[]): DocsTreeNode[] {
  return [...nodes]
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, "zh-CN");
    })
    .map((n) => (n.kind === "dir" ? { ...n, children: sortTree(n.children) } : n));
}

/** Build an explorer tree from workspace file paths (markdown only). */
export function buildDocsTree(files: Record<string, string>): DocsTreeNode[] {
  const root: DocsDirNode = { kind: "dir", name: "", path: "", children: [] };
  const paths = Object.keys(files)
    .map(normalizeDocsPath)
    .filter((p) => p && !isHiddenDocsPath(p) && p.toLowerCase().endsWith(".md"));

  for (const rel of paths) {
    const parts = rel.split("/").filter(Boolean);
    if (!parts.length) continue;
    const fileName = parts[parts.length - 1];
    const dirParts = parts.slice(0, -1);
    const parent = dirParts.length ? ensureDir(root, dirParts) : root;
    parent.children.push({ kind: "file", name: fileName, path: rel });
  }

  return sortTree(root.children);
}

/** Default doc to show when nothing is selected. */
export function defaultDocsPath(files: Record<string, string>): string | null {
  const visible = Object.keys(files)
    .map(normalizeDocsPath)
    .filter((p) => p && !isHiddenDocsPath(p) && p.toLowerCase().endsWith(".md"))
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (!visible.length) return null;
  const readme = visible.find((p) => p.toLowerCase() === "readme.md");
  return readme ?? visible[0];
}
