import Link from "next/link";
import type { UserProfileStats, UserPublic } from "@/lib/types";
import { cn } from "@/lib/utils";
import { UserProfileStatsStrip } from "@/components/user/UserProfileStatsStrip";

function profileCoverGradient(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) | 0;
  const hue1 = Math.abs(h) % 360;
  const hue2 = (hue1 + 42) % 360;
  return `linear-gradient(128deg, hsla(${hue1}, 38%, 20%, 0.96) 0%, hsla(${hue2}, 32%, 14%, 0.98) 48%, hsl(226, 28%, 8%) 100%)`;
}

function profileInitial(displayName: string | null, username: string): string {
  const raw = (displayName ?? username).trim();
  if (!raw.length) return "?";
  const first = [...raw][0];
  return first ? first.toLocaleUpperCase() : "?";
}

export type UserProfileViewModel = UserPublic & {
  stats: UserProfileStats;
  avatarUrl: string | null;
  coverUrl: string | null;
};

export function UserProfileHero({ profile, isOwn }: { profile: UserProfileViewModel; isOwn: boolean }) {
  const cover = profile.coverUrl?.trim();
  const avatar = profile.avatarUrl?.trim();
  const initial = profileInitial(profile.displayName, profile.username);

  return (
    <div className="w-full">
      <div className="relative -mx-6 min-h-[11rem] sm:min-h-[13.5rem]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL
          <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: profileCoverGradient(profile.username) }}
            aria-hidden
          />
        )}
        <div
          className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/55 to-transparent"
          aria-hidden
        />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg-base to-transparent" aria-hidden />
      </div>

      <div className="relative -mt-14 px-6 sm:-mt-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div
              className={cn(
                "relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-2 border-border/80 bg-surface shadow-lg sm:h-28 sm:w-28",
                "ring-2 ring-bg-base ring-offset-0"
              )}
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-display text-3xl text-accent sm:text-4xl">
                  {initial}
                </span>
              )}
            </div>
            <div className="min-w-0 pb-1">
              <p className="font-display text-2xl tracking-wide text-text-primary sm:text-3xl">
                @{profile.username}
              </p>
              <p className="text-ui-mono mt-1 max-w-xl text-sm text-text-muted">
                {profile.displayName?.trim() || "未设置显示名"}
              </p>
              <UserProfileStatsStrip stats={profile.stats} className="mt-2" />
              {isOwn && (
                <Link
                  href="/library/preferences#profile-media"
                  className="text-ui-mono mt-2 inline-block text-xs text-accent hover:underline"
                >
                  编辑封面、头像与资料
                </Link>
              )}
            </div>
          </div>
          <p className="text-ui-mono max-w-md pb-1 text-[11px] leading-relaxed text-text-muted/85 sm:text-right">
            独立开发者主页 · 下方列表为公开素材（按创建时间）。头像与封面为 HTTPS 图片链接。
          </p>
        </div>
      </div>
    </div>
  );
}
