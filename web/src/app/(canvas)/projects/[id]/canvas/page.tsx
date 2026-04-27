import Link from "next/link";
import { ProjectCanvasLoader } from "@/components/canvas/ProjectCanvas";

type Props = { params: Promise<{ id: string }> };

export default async function CanvasPage(props: Props) {
  const { id } = await props.params;
  return (
    <div className="relative h-[100dvh] w-full">
      <Link
        href="/projects"
        className="text-ui-mono absolute left-2 top-2 z-[300] rounded border border-border bg-bg-base/80 px-2 py-1 text-[11px] text-text-primary hover:border-accent/40"
      >
        ← 退出
      </Link>
      <ProjectCanvasLoader id={id} />
    </div>
  );
}
