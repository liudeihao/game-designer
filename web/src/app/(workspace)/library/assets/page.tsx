import { MyLibraryView } from "@/components/library/MyLibraryView";
import { BackendUnavailable } from "@/components/system/BackendUnavailable";
import { getMyLibraryAssetsInitial } from "@/lib/server-api";

type Props = { searchParams: Promise<{ group?: string }> };

export default async function MyAssetsPage(props: Props) {
  const sp = await props.searchParams;
  const group = sp.group;
  const initial = await getMyLibraryAssetsInitial(group);
  if (initial === null) {
    return (
      <div className="px-4 py-6">
        <h1 className="font-display text-2xl">我的库</h1>
        <div className="mt-4">
          <BackendUnavailable
            title="无法加载我的素材"
            detail="请确认后端已启动；这里不会向用户展示技术错误信息。"
          />
        </div>
      </div>
    );
  }
  return <MyLibraryView initialData={initial} />;
}
