import { MyLibraryView } from "@/components/library/MyLibraryView";
import { getMyLibraryAssetsInitial } from "@/lib/server-api";

type Props = { searchParams: Promise<{ group?: string }> };

export default async function MyAssetsPage(props: Props) {
  const sp = await props.searchParams;
  const group = sp.group;
  const initial = await getMyLibraryAssetsInitial(group);
  return <MyLibraryView initialData={initial} />;
}
