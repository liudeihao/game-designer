import { notFound } from "next/navigation";
import { AssetGrid } from "@/components/asset/AssetGrid";
import { BackendUnavailable } from "@/components/system/BackendUnavailable";
import { getUserPublicAssets, serverFetch } from "@/lib/server-api";
import type { UserPublic } from "@/lib/types";

type Props = { params: Promise<{ username: string }> };

export default async function UserPage(props: Props) {
  const { username } = await props.params;
  let r: Awaited<ReturnType<typeof serverFetch>>;
  try {
    r = await serverFetch(`/api/users/${encodeURIComponent(username)}`);
  } catch {
    return (
      <div className="p-6">
        <BackendUnavailable title="无法加载用户资料" />
      </div>
    );
  }
  if (r.status === 404) notFound();
  if (!r.ok) {
    return (
      <div className="p-6">
        <BackendUnavailable title="无法加载用户资料" />
      </div>
    );
  }
  const u = (await r.json()) as UserPublic;
  const assetsInitial = await getUserPublicAssets(username);

  return (
    <div className="px-6 py-10">
      <header className="mb-8 border-b border-divider pb-4">
        <h1 className="font-display text-3xl text-text-primary">@{u.username}</h1>
        <p className="text-ui-mono mt-2 text-sm text-text-muted">
          {u.displayName ?? "未设置显示名"}
        </p>
        <p className="text-ui-mono mt-1 text-[12px] text-text-muted/90">公开素材 · 按创建时间倒序</p>
      </header>
      {assetsInitial === null ? (
        <BackendUnavailable
          title="无法加载该用户的公开素材"
          detail="请确认后端已启动；这里不会显示技术错误详情。"
        />
      ) : (
        <>
          {assetsInitial.items.length === 0 && (
            <p className="text-ui-mono mb-6 text-sm text-text-muted">暂无公开素材</p>
          )}
          <AssetGrid
            scope="public"
            authorUsername={username}
            initialData={assetsInitial}
            gridSize="md"
          />
        </>
      )}
    </div>
  );
}
