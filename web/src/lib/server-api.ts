import { cookies, headers } from "next/headers";
import type { PaginatedAssets, Asset } from "./types";

/** Server-side calls to the Go API. Uses API_URL (direct) so RSC does not rely on Next rewrites. Forwards cookies. */
function serverApiBase(): string {
  const fromEnv = process.env.API_URL ?? process.env.INTERNAL_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://127.0.0.1:8080";
}

export async function serverFetch(path: string, init?: RequestInit) {
  const base = serverApiBase();
  const pathPart = path.startsWith("/") ? path : `/${path}`;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const requestHeaders = new Headers(init?.headers);
  if (cookieHeader) requestHeaders.set("cookie", cookieHeader);
  if (forwarded) requestHeaders.set("x-forwarded-for", forwarded);
  return fetch(`${base}${pathPart}`, {
    ...init,
    cache: "no-store",
    headers: requestHeaders,
  });
}

export async function getExploreAssets(): Promise<PaginatedAssets> {
  const r = await serverFetch("/api/assets?scope=public&limit=24");
  if (!r.ok) throw new Error("explore");
  return r.json();
}

export async function getAssetServer(id: string): Promise<Asset | null> {
  const r = await serverFetch(`/api/assets/${id}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("asset");
  return r.json();
}
