import { notFound } from "next/navigation";
import { AssetGrid } from "@/components/asset/AssetGrid";
import { BackendUnavailable } from "@/components/system/BackendUnavailable";
import { UserProfileHero, type UserProfileViewModel } from "@/components/user/UserProfileHero";
import { getUserPublicAssets, loadMe, serverFetch } from "@/lib/server-api";
import type { UserProfileStats, UserPublic } from "@/lib/types";

type Props = { params: Promise<{ username: string }> };

function normalizeProfile(u: UserPublic): UserProfileViewModel {
  const stats: UserProfileStats = u.stats ?? {
    publicAssets: 0,
    forksReceived: 0,
    projects: 0,
  };
  return {
    ...u,
    stats,
    avatarUrl: u.avatarUrl ?? null,
    coverUrl: u.coverUrl ?? null,
  };
}

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
  const profile = normalizeProfile(u);
  const viewer = await loadMe();
  const isOwn = viewer?.username === username;

  const assetsInitial = await getUserPublicAssets(username);

  return (
    <div className="min-h-0 flex-1 pb-12">
      <UserProfileHero profile={profile} isOwn={isOwn} />
      <div className="px-6">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">公开素材</h2>
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
    </div>
  );
}
