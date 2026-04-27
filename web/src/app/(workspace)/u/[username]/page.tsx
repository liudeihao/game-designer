import { notFound } from "next/navigation";
import { BackendUnavailable } from "@/components/system/BackendUnavailable";
import { serverFetch } from "@/lib/server-api";
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
  return (
    <div className="px-6 py-10">
      <h1 className="font-display text-3xl">@{u.username}</h1>
      <p className="text-ui-mono mt-2 text-sm text-text-muted">
        {u.displayName ?? "未设置显示名"}
      </p>
    </div>
  );
}
