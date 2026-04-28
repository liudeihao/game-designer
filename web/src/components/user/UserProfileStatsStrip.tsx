import type { UserProfileStats } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Compact profile meta (GitHub-style): small type, tabular counts, dot-separated.
 * Avoids large hero numerals — better for indie dev profiles.
 */
export function UserProfileStatsStrip({
  stats,
  className,
}: {
  stats: UserProfileStats;
  className?: string;
}) {
  const parts = [
    { n: stats.publicAssets, label: "公开素材" },
    { n: stats.forksReceived, label: "收到 Fork" },
    { n: stats.projects, label: "项目" },
  ] as const;

  return (
    <p
      className={cn(
        "flex flex-wrap items-baseline gap-x-0 gap-y-1 text-[13px] leading-snug text-text-muted",
        className
      )}
      aria-label="创作者统计"
    >
      {parts.map((p, i) => (
        <span key={p.label} className="inline-flex items-baseline gap-0">
          {i > 0 ? (
            <span className="mx-2 select-none text-text-muted/35" aria-hidden>
              ·
            </span>
          ) : null}
          <span className="font-semibold tabular-nums text-text-primary/90">{p.n}</span>
          <span className="ml-1">{p.label}</span>
        </span>
      ))}
    </p>
  );
}
