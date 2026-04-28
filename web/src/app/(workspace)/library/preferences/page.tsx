"use client";

import Link from "next/link";
import { ProfileMediaSettings } from "@/components/user/ProfileMediaSettings";
import { useUiPreferences } from "@/components/providers/UiPreferencesProvider";
import type { ColorScheme, FontScale, LibraryCardSize, LibraryViewMode } from "@/lib/ui-preferences";
import { cn } from "@/lib/utils";

function ScaleRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; t: string }[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-ui-mono text-xs text-text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "text-ui-mono rounded border px-3 py-1.5 text-sm",
              value === o.v
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-border text-text-muted hover:text-text-primary"
            )}
          >
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function LibraryPreferencesPage() {
  const { prefs, setPrefs } = useUiPreferences();

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <nav className="text-ui-mono text-xs text-text-muted/80">
        <Link href="/library/assets" className="hover:text-accent">
          我的库
        </Link>{" "}
        / <span className="text-text-primary">显示设置</span>
      </nav>
      <h1 className="font-display mt-2 text-3xl text-text-primary">显示与外观</h1>
      <p className="text-ui-mono mt-1 text-xs text-text-muted/90">
        以下设置仅保存在本机浏览器，含「我的库」宫格/列表与缩略图尺寸。
      </p>

      <div className="mt-8 space-y-8 border-t border-border/60 pt-8">
        <div>
          <h2 className="font-display text-lg text-text-primary">个人主页</h2>
          <p className="text-ui-mono mt-1 text-xs text-text-muted/90">
            封面与头像显示在公开主页 <span className="text-text-muted">/u/你的用户名</span>
          </p>
          <div className="mt-5 rounded border border-border/50 bg-surface/20 p-4">
            <ProfileMediaSettings />
          </div>
        </div>
        <ScaleRow
          label="配色"
          value={prefs.colorScheme}
          onChange={(v) => setPrefs({ colorScheme: v as ColorScheme })}
          options={[
            { v: "dark", t: "深色" },
            { v: "light", t: "浅色" },
          ]}
        />
        <ScaleRow
          label="界面字体大小"
          value={prefs.fontScale}
          onChange={(v) => setPrefs({ fontScale: v as FontScale })}
          options={[
            { v: "sm", t: "小" },
            { v: "md", t: "中" },
            { v: "lg", t: "大" },
          ]}
        />
        <ScaleRow
          label="我的库布局"
          value={prefs.libraryViewMode ?? "grid"}
          onChange={(v) => setPrefs({ libraryViewMode: v as LibraryViewMode })}
          options={[
            { v: "grid", t: "宫格" },
            { v: "list", t: "列表" },
          ]}
        />
        <ScaleRow
          label="素材宫格缩略图"
          value={prefs.libraryCardSize}
          onChange={(v) => setPrefs({ libraryCardSize: v as LibraryCardSize })}
          options={[
            { v: "none", t: "无缩略图" },
            { v: "sm", t: "小" },
            { v: "md", t: "中" },
            { v: "lg", t: "大" },
          ]}
        />
      </div>
    </div>
  );
}
