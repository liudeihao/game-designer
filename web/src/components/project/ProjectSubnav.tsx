"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ProjectSubnav({ projectId, projectName }: { projectId: string; projectName: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
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
        href="/projects"
        className="text-ui-mono text-[11px] text-text-muted hover:text-accent"
        title="返回项目列表"
      >
        ← 项目
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
                "text-ui-mono rounded px-2.5 py-1 text-[11px]",
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
