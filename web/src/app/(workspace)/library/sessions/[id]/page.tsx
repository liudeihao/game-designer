import { notFound } from "next/navigation";
import { SessionWorkspace } from "@/components/session/SessionWorkspace";
import { BackendUnavailable } from "@/components/system/BackendUnavailable";
import { serverFetch } from "@/lib/server-api";
import type { SessionDetail } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

export default async function SessionPage(props: Props) {
  const { id } = await props.params;
  let r: Awaited<ReturnType<typeof serverFetch>>;
  try {
    r = await serverFetch(`/api/sessions/${id}`);
  } catch {
    return (
      <div className="p-6">
        <BackendUnavailable title="无法加载会话" />
      </div>
    );
  }
  if (r.status === 404) notFound();
  if (!r.ok) {
    return (
      <div className="p-6">
        <BackendUnavailable title="无法加载会话" />
      </div>
    );
  }
  const initial = (await r.json()) as SessionDetail;
  return <SessionWorkspace id={id} initial={initial} />;
}
