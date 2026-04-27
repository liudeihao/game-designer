import Link from "next/link";
import { AssetGrid } from "@/components/asset/AssetGrid";
import type { Asset, PaginatedAssets } from "@/lib/types";
import { serverFetch } from "@/lib/server-api";

async function getPrivateInitial(): Promise<PaginatedAssets> {
  const r = await serverFetch("/api/assets?scope=private&limit=24");
  if (!r.ok) throw new Error("library");
  return r.json();
}

export default async function MyAssetsPage() {
  const initial = await getPrivateInitial();
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-52 shrink-0 border-r border-divider p-4 lg:block">
        <p className="text-ui-mono text-[11px] uppercase tracking-wider text-text-muted">素材</p>
        <ul className="mt-2 space-y-1 text-ui-mono text-[12px] text-text-primary">
          <li>
            <Link href="/library/assets" className="block rounded px-2 py-1 text-accent">
              全部素材
            </Link>
          </li>
        </ul>
      </aside>
      <div className="min-w-0 flex-1 px-4 py-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl">我的库</h1>
          <Link
            href="/library/assets/new"
            className="text-ui-mono rounded bg-accent/15 px-3 py-1.5 text-sm text-accent hover:bg-accent/25"
          >
            新建素材
          </Link>
        </div>
        <AssetGrid
          scope="private"
          initialData={initial}
          itemHref={(a: Asset) => `/library/assets/${a.id}`}
        />
      </div>
    </div>
  );
}
