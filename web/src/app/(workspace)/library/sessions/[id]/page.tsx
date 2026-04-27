import { notFound } from "next/navigation";
import { SessionWorkspace } from "@/components/session/SessionWorkspace";
import { serverFetch } from "@/lib/server-api";
import type { SessionDetail } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

export default async function SessionPage(props: Props) {
  const { id } = await props.params;
  const r = await serverFetch(`/api/sessions/${id}`);
  if (r.status === 404) notFound();
  const initial = (await r.json()) as SessionDetail;
  return <SessionWorkspace id={id} initial={initial} />;
}
