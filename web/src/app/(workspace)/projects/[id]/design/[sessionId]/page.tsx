import { notFound } from "next/navigation";
import { ProjectDesignWorkspace } from "@/components/project/ProjectDesignWorkspace";
import { BackNavLink } from "@/components/ui/BackNavLink";
import { BackendUnavailable } from "@/components/system/BackendUnavailable";
import { serverFetch } from "@/lib/server-api";
import type { SessionDetail } from "@/lib/types";

type Props = { params: Promise<{ id: string; sessionId: string }> };

export default async function ProjectDesignSessionPage(props: Props) {
  const { id, sessionId } = await props.params;
  let r: Awaited<ReturnType<typeof serverFetch>>;
  try {
    r = await serverFetch(`/api/sessions/${sessionId}`);
  } catch {
    return (
      <div className="p-6">
        <BackendUnavailable title="无法加载设计会话" />
        <BackNavLink href={`/projects/${id}/design`} className="mt-4">
          返回设计
        </BackNavLink>
      </div>
    );
  }
  if (r.status === 404) notFound();
  if (!r.ok) {
    return (
      <div className="p-6">
        <BackendUnavailable title="无法加载设计会话" />
      </div>
    );
  }
  const session = (await r.json()) as SessionDetail;
  if (session.projectId !== id) notFound();
  return <ProjectDesignWorkspace projectId={id} sessionId={sessionId} initialSession={session} />;
}
