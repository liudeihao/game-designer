import type { IllustrationHome } from "../../types/illustration";
import { cn } from "@/lib/utils";

const HOMES: { id: IllustrationHome; label: string }[] = [
  { id: "doc", label: "挂到文档" },
  { id: "unbound", label: "未绑定" },
  { id: "draft", label: "草稿" },
];

export function IllustrationHomeSelect({
  home,
  linkedDoc,
  docPaths,
  onChange,
  disabled,
  compact,
}: {
  home: IllustrationHome;
  linkedDoc: string | null;
  docPaths: string[];
  onChange: (home: IllustrationHome, linkedDoc: string | null) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", compact && "text-[12px]")}>
      <select
        className="h-7 max-w-full rounded-md border border-input/70 bg-background px-1.5 text-[12px]"
        value={home}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value as IllustrationHome;
          onChange(next, next === "doc" ? linkedDoc || docPaths[0] || null : null);
        }}
      >
        {HOMES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      {home === "doc" && (
        <select
          className="h-7 min-w-0 max-w-[12rem] truncate rounded-md border border-input/70 bg-background px-1.5 text-[12px]"
          value={linkedDoc || ""}
          disabled={disabled || docPaths.length === 0}
          onChange={(e) => onChange("doc", e.target.value || null)}
        >
          {docPaths.length === 0 ? (
            <option value="">没有文档</option>
          ) : (
            docPaths.map((path) => (
              <option key={path} value={path}>
                {path}
              </option>
            ))
          )}
        </select>
      )}
    </div>
  );
}
