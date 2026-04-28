import { ProjectCanvasLoader } from "@/components/canvas/ProjectCanvas";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectCanvasPage(props: Props) {
  const { id } = await props.params;
  return (
    <div className="h-full min-h-0 w-full">
      <ProjectCanvasLoader id={id} embedded />
    </div>
  );
}
