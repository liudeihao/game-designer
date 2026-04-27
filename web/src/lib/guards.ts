import type { Asset, AssetFull } from "./types";

export function isAssetFull(a: Asset): a is AssetFull {
  return a.visibility !== "deleted";
}
