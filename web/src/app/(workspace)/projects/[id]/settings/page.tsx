import Link from "next/link";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectSettingsPage(props: Props) {
  const { id } = await props.params;
  return (
    <div className="px-6 py-8">
      <h1 className="font-display text-2xl">项目设置</h1>
      <p className="text-ui-mono mt-2 text-sm text-text-muted">项目 ID: {id}</p>
      <Link href={`/projects/${id}/canvas`} className="text-ui-mono mt-6 inline-block text-accent">
        进入画布
      </Link>
    </div>
  );
}
