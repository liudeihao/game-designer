import { headers } from "next/headers";
import type { PaginatedAssets, Asset } from "./types";

export async function serverFetch(path: string) {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  return fetch(`${proto}://${host}${path}`, { cache: "no-store" });
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
