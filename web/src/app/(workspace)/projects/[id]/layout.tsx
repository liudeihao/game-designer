import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectSubnav } from "@/components/project/ProjectSubnav";
import { BackendUnavailable } from "@/components/system/BackendUnavailable";
import { serverFetch } from "@/lib/server-api";
import type { ProjectDetail } from "@/lib/types";

type Props = { children: React.ReactNode; params: Promise<{ id: string }> };

export default async function ProjectWorkspaceLayout(props: Props) {
  const { id } = await props.params;
  let r: Awaited<ReturnType<typeof serverFetch>>;
  try {
    r = await serverFetch(`/api/projects/${id}`);
  } catch {
    return (
      <div className="px-6 py-8">
        <BackendUnavailable title="无法加载项目" />
        <Link href="/projects" className="text-ui-mono mt-4 inline-block text-accent">
          ← 返回项目列表
        </Link>
      </div>
    );
  }
  if (r.status === 404) notFound();
  if (!r.ok) {
    return (
      <div className="px-6 py-8">
        <BackendUnavailable title="无法加载项目" />
        <Link href="/projects" className="text-ui-mono mt-4 inline-block text-accent">
          ← 返回项目列表
        </Link>
      </div>
    );
  }
  const project = (await r.json()) as ProjectDetail;
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <ProjectSubnav projectId={id} projectName={project.name} />
      <div className="min-h-0 flex-1 overflow-hidden">{props.children}</div>
    </div>
  );
}
