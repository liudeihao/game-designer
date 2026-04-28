/** Tokens like type:image tag:foo — remainder becomes backend full-text `q`. */

export type ParsedToolbarTokens = {
  remainder: string;
  hasImage?: boolean;
  tagHints: string[];
};

export function parseToolbarTokens(raw: string): ParsedToolbarTokens {
  let remainder = raw.replace(/\s+/g, " ").trim();
  let hasImage: boolean | undefined;
  const tagHints: string[] = [];

  if (/\btype:image\b/i.test(remainder)) {
    hasImage = true;
    remainder = remainder.replace(/\btype:image\b/gi, "").trim();
  }
  if (/\btype:any\b/i.test(remainder)) {
    hasImage = false;
    remainder = remainder.replace(/\btype:any\b/gi, "").trim();
  }

  remainder = remainder.replace(/\btag:([^\s]+)/gi, (_, tag: string) => {
    try {
      tagHints.push(decodeURIComponent(tag));
    } catch {
      tagHints.push(tag);
    }
    return "";
  });
  remainder = remainder.replace(/\s+/g, " ").trim();

  return { remainder, hasImage, tagHints };
}

export function mergeLibraryHref(
  current: URLSearchParams,
  patch: Record<string, string | null | undefined>
): string {
  const p = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") p.delete(k);
    else p.set(k, v);
  }
  const s = p.toString();
  return s ? `/library/assets?${s}` : "/library/assets";
}
