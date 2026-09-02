import { FileMinus2, FilePlus2, FilePenLine, FileText } from "lucide-react";
import type { FileRef } from "../../types";
import { cn } from "@/lib/utils";

function fileName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

function preview(text: string, limit = 240): string {
  const t = text.trim();
  if (t.length <= limit) return t;
  return `${t.slice(0, limit).trimEnd()}…`;
}

function opMeta(f: FileRef): { label: string; Icon: typeof FileText } {
  if (f.op === "delete") return { label: "已删除", Icon: FileMinus2 };
  if (f.op === "search_replace") return { label: "替换", Icon: FilePenLine };
  if (f.created === true) return { label: "新建", Icon: FilePlus2 };
  if (f.created === false) return { label: "覆写", Icon: FileText };
  return { label: "已更新", Icon: FileText };
}

interface Props {
  files: FileRef[];
  onOpenFile?: (path: string) => void;
  className?: string;
}

export function FileRefsBar({ files, onOpenFile, className }: Props) {
  if (!files.length) return null;
  return (
    <div className={cn("mt-1.5 flex flex-col gap-1.5", className)}>
      {files.map((f) => {
        const deleted = f.op === "delete";
        const { label, Icon } = opMeta(f);
        const name = fileName(f.path);
        const replacePreview = f.op === "search_replace" && (f.old || f.new);
        return (
          <div key={`${f.op || "write"}:${f.path}`} className="min-w-0">
            <button
              type="button"
              title={f.path}
              disabled={deleted || !onOpenFile}
              onClick={() => onOpenFile?.(f.path)}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-[12px] ring-1 transition-colors",
                deleted
                  ? "cursor-default text-muted-foreground/70 ring-border/50 line-through"
                  : "bg-muted/50 text-foreground/90 ring-border/60 hover:bg-primary/10 hover:text-foreground hover:ring-primary/30",
                !onOpenFile && !deleted && "cursor-default",
              )}
            >
              <Icon className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono">{name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{label}</span>
            </button>
            {replacePreview && (
              <div className="mt-1 space-y-1 rounded-md bg-muted/40 px-2 py-1.5 font-mono text-[11px] leading-snug ring-1 ring-border/40">
                {f.old ? (
                  <div className="text-destructive/80">
                    <span className="mr-1 text-muted-foreground">−</span>
                    {preview(f.old)}
                  </div>
                ) : null}
                {f.new ? (
                  <div className="text-success">
                    <span className="mr-1 text-muted-foreground">+</span>
                    {preview(f.new)}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
