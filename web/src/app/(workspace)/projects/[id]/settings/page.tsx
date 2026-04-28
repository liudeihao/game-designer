import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectSettingsForm } from "@/components/project/ProjectSettingsForm";
import { BackendUnavailable } from "@/components/system/BackendUnavailable";
import { serverFetch } from "@/lib/server-api";
import type { ProjectDetail } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectSettingsPage(props: Props) {
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
    <div className="px-6 py-8">
      <h1 className="font-display text-2xl">项目设置</h1>
      <p className="text-ui-mono mt-1 text-xs text-text-muted/80">ID · {id}</p>
      <ProjectSettingsForm projectId={id} initialName={project.name} />
    </div>
  );
}
