import { notFound } from "next/navigation";
import { AssetDetailView } from "@/components/asset/AssetDetailView";
import { BackendUnavailable } from "@/components/system/BackendUnavailable";
import { getAssetServer } from "@/lib/server-api";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ linkToProject?: string }>;
};

export default async function AssetPage(props: Props) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const linkToProject = sp.linkToProject?.trim() || null;
  const res = await getAssetServer(id);
  if (res.ok === false) {
    if (res.notFound) notFound();
    return (
      <div className="px-4 py-10">
        <BackendUnavailable title="暂时无法加载该素材" />
      </div>
    );
  }
  return <AssetDetailView id={id} initial={res.asset} linkToProject={linkToProject} />;
}
