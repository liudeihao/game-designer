"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "gd-library-stash:v1";

export type LibraryStashEntry = {
  id: string;
  name: string;
  addedAt: number;
};

export function readLibraryStash(): LibraryStashEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as LibraryStashEntry[];
    return Array.isArray(j) ? j.filter((x) => x?.id && typeof x.name === "string") : [];
  } catch {
    return [];
  }
}

export function writeLibraryStash(entries: LibraryStashEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/** Bottom tray: hover-expand, drag-drop target, persists to localStorage. Drag payload JSON `{ id, name }`. */
export function LibraryStashBar({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LibraryStashEntry[]>([]);

  useEffect(() => {
    setItems(readLibraryStash());
  }, []);

  const persist = useCallback((next: LibraryStashEntry[]) => {
    setItems(next);
    writeLibraryStash(next);
    window.dispatchEvent(new CustomEvent("gd-library-stash"));
  }, []);

  useEffect(() => {
    const sync = () => setItems(readLibraryStash());
    window.addEventListener("gd-library-stash", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("gd-library-stash", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;
    try {
      const j = JSON.parse(raw) as { id?: string; name?: string };
      if (!j?.id) return;
      const next = readLibraryStash();
      if (next.some((x) => x.id === j.id)) return;
      persist([
        ...next,
        { id: j.id, name: j.name ?? j.id.slice(0, 8), addedAt: Date.now() },
      ]);
      setOpen(true);
    } catch {
      /* ignore */
    }
  };

  const remove = (id: string) => {
    persist(items.filter((x) => x.id !== id));
  };

  const clear = () => persist([]);

  const copyIds = () => {
    void navigator.clipboard.writeText(items.map((x) => x.id).join("\n"));
  };

  return (
    <div
      className={cn(
        "pointer-events-auto fixed bottom-0 left-0 right-0 z-[80] flex justify-center pb-[max(0.25rem,env(safe-area-inset-bottom))]",
        className
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        className={cn(
          "border border-border/60 bg-bg-base/95 shadow-lg transition-[max-height] duration-200 ease-out",
          open ? "max-h-[45vh] w-full max-w-3xl rounded-t-lg" : "max-h-9 w-full max-w-xl rounded-t-md"
        )}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <button
          type="button"
          className="text-ui-mono flex w-full items-center justify-center gap-2 border-b border-border/40 px-3 py-1.5 text-[11px] text-text-muted hover:text-text-primary"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <GripHorizontal className="h-4 w-4 shrink-0 opacity-70" />
          <span>暂存区</span>
          {items.length > 0 && (
            <span className="rounded bg-accent/15 px-1.5 py-px text-accent">{items.length}</span>
          )}
          <span className="text-text-muted/70">拖拽素材到此处 · 带去画布</span>
        </button>
        <div className={cn("gd-scrollbar overflow-y-auto px-3", open ? "max-h-[38vh] py-2" : "hidden")}>
          {items.length === 0 ? (
            <p className="text-ui-mono text-center text-[11px] text-text-muted">从列表拖入卡片，或稍后在 Inspector 中添加</p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((x) => (
                <li
                  key={x.id}
                  className="text-ui-mono flex items-center gap-2 rounded border border-border/50 bg-surface/50 px-2 py-1 text-[12px]"
                >
                  <Link href={`/library/assets/${encodeURIComponent(x.id)}`} className="min-w-0 flex-1 truncate text-text-primary hover:text-accent">
                    {x.name}
                  </Link>
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-text-muted hover:text-error-dim"
                    title="移除"
                    onClick={() => remove(x.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {items.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 border-t border-border/30 pt-2">
              <button
                type="button"
                className="text-ui-mono rounded border border-border/50 px-2 py-1 text-[10px] text-text-muted hover:border-accent/30"
                onClick={copyIds}
              >
                复制全部 ID
              </button>
              <button
                type="button"
                className="text-ui-mono rounded border border-border/50 px-2 py-1 text-[10px] text-text-muted hover:border-error-dim/40"
                onClick={clear}
              >
                清空
              </button>
              <Link
                href="/projects"
                className="text-ui-mono rounded border border-accent/25 bg-accent/5 px-2 py-1 text-[10px] text-accent hover:bg-accent/10"
                title="打开项目后进入画布时可从暂存批量引用（占位）"
              >
                项目与画布 →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Add entry from code (e.g. Inspector button). */
export function stashAddEntry(id: string, name: string) {
  const cur = readLibraryStash();
  if (cur.some((x) => x.id === id)) return;
  writeLibraryStash([...cur, { id, name, addedAt: Date.now() }]);
  window.dispatchEvent(new CustomEvent("gd-library-stash"));
}
