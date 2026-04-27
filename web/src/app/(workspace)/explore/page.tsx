import { AssetGrid } from "@/components/asset/AssetGrid";
import { getExploreAssets } from "@/lib/server-api";

export default async function ExplorePage() {
  const initial = await getExploreAssets();
  return (
    <div className="px-6 py-8">
      <header className="mb-8 border-b border-divider pb-4">
        <h1 className="font-display text-3xl text-text-primary">探索</h1>
        <p className="text-ui-mono mt-1 text-[12px] text-text-muted">公开素材库 · 按创建时间倒序</p>
      </header>
      <AssetGrid scope="public" initialData={initial} />
    </div>
  );
}
