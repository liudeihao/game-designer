/**
 * CDN-style URLs get an optional width query; data/blob URLs must stay unchanged.
 */
export function imageDisplaySrc(url: string, width: number): string {
  const u = url.trim();
  if (!u) return u;
  if (u.startsWith("data:") || u.startsWith("blob:")) return u;
  if (u.includes("?")) return u;
  return `${u}?w=${width}`;
}
