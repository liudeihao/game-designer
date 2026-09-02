/** Normalize a docs-relative path (forward slashes, no leading slash). */
export function normalizeDocsPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").trim();
}

/** Paths under `.studio/` are agent-internal and hidden from the explorer. */
export function isHiddenDocsPath(path: string): boolean {
  const p = normalizeDocsPath(path);
  return p === ".studio" || p.startsWith(".studio/");
}

/** Return a usable docs path for navigation, or null if invalid/hidden. */
export function parseDocsPath(path: string): string | null {
  const cleaned = normalizeDocsPath(path);
  if (!cleaned || cleaned.endsWith("/") || isHiddenDocsPath(cleaned)) return null;
  if (!cleaned.toLowerCase().endsWith(".md")) return null;
  return cleaned;
}

export function formatMarkdownSource(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}
