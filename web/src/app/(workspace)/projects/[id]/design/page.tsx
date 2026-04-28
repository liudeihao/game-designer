import { redirect } from "next/navigation";
import { serverFetch } from "@/lib/server-api";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectDesignIndexPage(props: Props) {
  const { id } = await props.params;
  const r = await serverFetch(`/api/projects/${id}/sessions`);
  if (!r.ok) redirect("/projects");
  const sessions = (await r.json()) as { id: string }[];
  if (!sessions.length) redirect(`/projects/${id}/settings`);
  redirect(`/projects/${id}/design/${sessions[0].id}`);
}
