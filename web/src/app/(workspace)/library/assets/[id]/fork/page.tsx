import { notFound } from "next/navigation";
import { getAssetServer } from "@/lib/server-api";
import { ForkGraphEntry } from "./ForkGraphEntry";

type Props = { params: Promise<{ id: string }> };

export default async function ForkGraphPage(props: Props) {
  const { id } = await props.params;
  const res = await getAssetServer(id);
  if (res.ok === false && res.notFound) notFound();
  return <ForkGraphEntry id={id} />;
}
