import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import type { DocsTreeNode } from "../lib/docsTree";
import { cn } from "@/lib/utils";

interface Props {
  nodes: DocsTreeNode[];
  depth?: number;
  expanded: Record<string, boolean>;
  onToggle: (key: string) => void;
  selectedFilePath: string | null;
  selectedDir: string | null;
  highlightedPath?: string | null;
  onSelectDir: (dir: string) => void;
  onSelectFile: (path: string) => void;
}

export function DocsExplorerTree({
  nodes,
  depth = 0,
  expanded,
  onToggle,
  selectedFilePath,
  selectedDir,
  highlightedPath,
  onSelectDir,
  onSelectFile,
}: Props) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === "dir") {
          const key = node.path || "__root__";
          const isOpen = expanded[key] ?? depth < 2;
          const active =
            !selectedFilePath &&
            normalizeSel(selectedDir) === normalizeSel(node.path);
          const highlighted =
            !!highlightedPath &&
            (highlightedPath === node.path || highlightedPath.startsWith(`${node.path}/`));
          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => {
                  onToggle(key);
                  onSelectDir(node.path);
                }}
                className={cn(
                  "mb-px flex w-full items-center gap-1 rounded-sm py-1 pr-1.5 text-left text-[12.5px] transition-colors",
                  active
                    ? "bg-primary/12 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  highlighted && !active && "bg-primary/8 text-foreground",
                )}
                style={{ paddingLeft: 8 + depth * 12 }}
              >
                {node.children.length > 0 ? (
                  isOpen ? (
                    <ChevronDown className="size-3 shrink-0" />
                  ) : (
                    <ChevronRight className="size-3 shrink-0" />
                  )
                ) : (
                  <span className="size-3 shrink-0" />
                )}
                <Folder className="size-3 shrink-0 text-amber-600/80 dark:text-amber-400/80" />
                <span className="min-w-0 flex-1 truncate">{node.name || "docs"}</span>
              </button>
              {isOpen && node.children.length > 0 && (
                <DocsExplorerTree
                  nodes={node.children}
                  depth={depth + 1}
                  expanded={expanded}
                  onToggle={onToggle}
                  selectedFilePath={selectedFilePath}
                  selectedDir={selectedDir}
                  highlightedPath={highlightedPath}
                  onSelectDir={onSelectDir}
                  onSelectFile={onSelectFile}
                />
              )}
            </div>
          );
        }

        const active = selectedFilePath === node.path;
        const highlighted = highlightedPath === node.path;
        return (
          <button
            key={node.path}
            type="button"
            onClick={() => onSelectFile(node.path)}
            className={cn(
              "mb-px flex w-full items-center gap-1 rounded-sm py-1 pr-1.5 text-left text-[12.5px] transition-colors",
              active
                ? "bg-primary/12 font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              highlighted && !active && "ring-1 ring-inset ring-primary/35",
            )}
            style={{ paddingLeft: 8 + depth * 12 }}
            title={node.path}
          >
            <span className="size-3 shrink-0" />
            <FileText className="size-3 shrink-0 text-sky-600/80 dark:text-sky-400/70" />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
          </button>
        );
      })}
    </>
  );
}

function normalizeSel(dir: string | null | undefined): string {
  return (dir || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}
