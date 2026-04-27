import { notFound } from "next/navigation";
import { AssetDetailView } from "@/components/asset/AssetDetailView";
import { getAssetServer } from "@/lib/server-api";

type Props = { params: Promise<{ id: string }> };

export default async function AssetPage(props: Props) {
  const { id } = await props.params;
  const asset = await getAssetServer(id);
  if (!asset) notFound();
  return <AssetDetailView id={id} initial={asset} />;
}
