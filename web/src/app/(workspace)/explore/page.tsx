import { AssetGrid } from "@/components/asset/AssetGrid";
import { BackendUnavailable } from "@/components/system/BackendUnavailable";
import { getExploreAssets } from "@/lib/server-api";

export default async function ExplorePage() {
  const initial = await getExploreAssets();
  if (initial === null) {
    return (
      <div className="px-6 py-8">
        <header className="mb-8 border-b border-divider pb-4">
          <h1 className="font-display text-3xl text-text-primary">探索</h1>
          <p className="text-ui-mono mt-1 text-[12px] text-text-muted">
            全站用户可见 · 与「我的库」中的私有不属于同一空间 · 按创建时间倒序
          </p>
        </header>
        <BackendUnavailable title="无法加载公开素材" detail="请确认后端已启动；这里不会显示技术错误详情。" />
      </div>
    );
  }
  return (
    <div className="px-6 py-8">
      <header className="mb-8 border-b border-divider pb-4">
        <h1 className="font-display text-3xl text-text-primary">探索</h1>
        <p className="text-ui-mono mt-1 text-[12px] text-text-muted">
          全站用户可见 · 与「我的库」中的私有不属于同一空间 · 按创建时间倒序
        </p>
      </header>
      <AssetGrid scope="public" initialData={initial} />
    </div>
  );
}
