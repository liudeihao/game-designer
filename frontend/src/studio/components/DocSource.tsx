import { useEffect, useState, type ReactNode } from "react";
import { Code2, Eye } from "lucide-react";
import { formatMarkdownSource } from "../lib/docsPaths";
import { cn } from "@/lib/utils";
import { Button } from "../../components/ui/button";

/** Toggle button for Typora-like preview ↔ source on a single document. */
export function SourceModeButton({
  active,
  onClick,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={active ? "预览" : "源码"}
      title={active ? "预览" : "源码"}
    >
      {active ? <Eye className="size-3.5" /> : <Code2 className="size-3.5" />}
    </Button>
  );
}

export function SourcePre({ data, className }: { data: unknown; className?: string }) {
  return (
    <pre
      className={cn(
        "max-h-[min(70vh,40rem)] overflow-auto rounded-md bg-muted/40 px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground/90",
        className,
      )}
    >
      {typeof data === "string" ? formatMarkdownSource(data) : formatMarkdownSource(String(data ?? ""))}
    </pre>
  );
}

/** Local preview/source toggle state for a document card. */
export function useDocSourceMode(resetKey?: string) {
  const [sourceMode, setSourceMode] = useState(false);
  useEffect(() => {
    setSourceMode(false);
  }, [resetKey]);
  return {
    sourceMode,
    setSourceMode,
    toggleSource: () => setSourceMode((v) => !v),
  };
}

/** Scroll/highlight a document card by `data-doc-path` when focusPath changes. */
export function useFocusDocPath(focusPath: string | null | undefined, onConsumed?: () => void) {
  useEffect(() => {
    if (!focusPath) return;
    const path = focusPath.replace(/\\/g, "/").replace(/^\/+/, "");
    const id = window.setTimeout(() => {
      const el = Array.from(document.querySelectorAll<HTMLElement>("[data-doc-path]")).find(
        (node) => node.getAttribute("data-doc-path") === path,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        el.classList.add("ring-2", "ring-primary/40");
        window.setTimeout(() => {
          el.classList.remove("ring-2", "ring-primary/40");
        }, 1600);
      }
      onConsumed?.();
    }, 50);
    return () => window.clearTimeout(id);
  }, [focusPath, onConsumed]);
}

/** @deprecated use useFocusDocPath */
export const useFocusGddPath = useFocusDocPath;

export function DocPathAnchor({
  path,
  className,
  children,
}: {
  path: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-doc-path={path} data-gdd-path={path} className={cn("rounded-md transition-shadow", className)}>
      {children}
    </div>
  );
}
