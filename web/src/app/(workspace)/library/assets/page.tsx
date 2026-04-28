import { MyLibraryView } from "@/components/library/MyLibraryView";
import { BackendUnavailable } from "@/components/system/BackendUnavailable";
import { getMyLibraryAssetsInitial } from "@/lib/server-api";

type Props = {
  searchParams: Promise<{
    group?: string;
    vis?: string;
    sort?: string;
    q?: string;
    hasImage?: string;
  }>;
};

export default async function MyAssetsPage(props: Props) {
  const sp = await props.searchParams;
  const group = sp.group;
  const visRaw = sp.vis;
  /** 默认「仅自己可见」（可编辑工作台）；显式 vis=all 为全部；vis=public 为已上探索 */
  const visibility: "private" | "public" | null =
    visRaw === "public" ? "public" : visRaw === "all" ? null : "private";
  const initial = await getMyLibraryAssetsInitial({
    groupId: group,
    visibility,
    sort: sp.sort,
    q: sp.q,
    hasImage: sp.hasImage === "true",
  });
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
  return (
    <MyLibraryView initialData={initial} libraryVisibility={visibility} />
  );
}
