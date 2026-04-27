import Link from "next/link";
import { ProjectCanvasLoader } from "@/components/canvas/ProjectCanvas";

type Props = { params: Promise<{ id: string }> };

export default async function CanvasPage(props: Props) {
  const { id } = await props.params;
  return (
    <div className="relative h-[100dvh] w-full">
      <div className="text-ui-mono absolute left-2 top-2 z-[300] flex flex-wrap items-center gap-1.5">
        <Link
          href="/projects"
          className="rounded border border-border bg-bg-base/80 px-2 py-1 text-[11px] text-text-primary hover:border-accent/40"
        >
          ← 项目
        </Link>
        <Link
          href={`/projects/${id}/settings`}
          className="rounded border border-border/70 bg-bg-base/80 px-2 py-1 text-[11px] text-text-muted hover:border-accent/35 hover:text-text-primary"
        >
          设置
        </Link>
      </div>
      <ProjectCanvasLoader id={id} />
    </div>
  );
}
