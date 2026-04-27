import { notFound } from "next/navigation";
import { serverFetch } from "@/lib/server-api";
import type { UserPublic } from "@/lib/types";

type Props = { params: Promise<{ username: string }> };

export default async function UserPage(props: Props) {
  const { username } = await props.params;
  const r = await serverFetch(`/api/users/${encodeURIComponent(username)}`);
  if (r.status === 404) notFound();
  if (!r.ok) throw new Error("profile");
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
