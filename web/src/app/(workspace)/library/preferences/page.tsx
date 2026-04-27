"use client";

import Link from "next/link";
import { useUiPreferences } from "@/components/providers/UiPreferencesProvider";
import type { FontScale, LibraryCardSize, LibraryViewMode } from "@/lib/ui-preferences";
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
      <p className="text-ui-mono text-[11px] text-text-muted">{label}</p>
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
      <nav className="text-ui-mono text-[11px] text-text-muted/80">
        <Link href="/library/assets" className="hover:text-accent">
          我的库
        </Link>{" "}
        / <span className="text-text-primary">显示设置</span>
      </nav>
      <h1 className="font-display mt-2 text-3xl text-text-primary">显示与字体</h1>
      <p className="text-ui-mono mt-1 text-[12px] text-text-muted/90">
        以下设置仅保存在本机浏览器，可配合「我的库」工具条调整宫格缩略图尺寸（含无缩略图）与视图。
      </p>

      <div className="mt-8 space-y-8 border-t border-border/60 pt-8">
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
        <ScaleRow
          label="默认布局"
          value={prefs.libraryViewMode}
          onChange={(v) => setPrefs({ libraryViewMode: v as LibraryViewMode })}
          options={[
            { v: "grid", t: "宫格" },
            { v: "list", t: "列表" },
          ]}
        />
      </div>
    </div>
  );
}
