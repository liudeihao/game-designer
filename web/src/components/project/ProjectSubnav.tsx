"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProjectSubnav({ projectId, projectName }: { projectId: string; projectName: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const onCanvasOrSettings =
    pathname === `${base}/canvas` ||
    pathname === `${base}/settings` ||
    pathname.startsWith(`${base}/settings/`);
  const backHref = onCanvasOrSettings ? `${base}/design` : "/projects";
  const backLabel = onCanvasOrSettings ? "返回设计" : "返回项目列表";
  const tabs: { href: string; label: string; match: (p: string) => boolean }[] = [
    {
      href: `${base}/design`,
      label: "设计",
      match: (p) => p === `${base}/design` || p.startsWith(`${base}/design/`),
    },
    { href: `${base}/canvas`, label: "情绪板", match: (p) => p === `${base}/canvas` },
    { href: `${base}/settings`, label: "设置", match: (p) => p.startsWith(`${base}/settings`) },
  ];
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-bg-base/80 px-4 py-2">
      <Link
        href={backHref}
        className="text-text-muted hover:text-accent flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/5"
        title={backLabel}
        aria-label={backLabel}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
      </Link>
      <span className="text-border/60">|</span>
      <h2 className="font-display min-w-0 max-w-[12rem] truncate text-sm text-text-primary sm:max-w-xs">
        {projectName}
      </h2>
      <nav className="ml-auto flex flex-wrap items-center gap-1">
        {tabs.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "text-ui-mono rounded px-2.5 py-1 text-xs",
                active
                  ? "border border-accent/35 bg-accent/10 text-accent"
                  : "border border-transparent text-text-muted hover:border-border/80 hover:text-text-primary"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
