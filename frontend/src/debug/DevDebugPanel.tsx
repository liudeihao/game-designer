import { useEffect, useMemo, useState } from "react";
import { Bug, ChevronDown, Copy, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  clearDebugEvents,
  formatDebugEvent,
  getDebugEvents,
  getUnreadDebugCount,
  isDebugPanelOpen,
  setDebugPanelOpen,
  subscribeDebugLog,
  toggleDebugPanel,
  type DebugEvent,
} from "./log";

function levelTone(level: DebugEvent["level"]) {
  if (level === "error") return "text-destructive";
  if (level === "warn") return "text-warning";
  return "text-muted-foreground";
}

function clock(ts: number) {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });
}

export function DevDebugPanel() {
  const [open, setOpen] = useState(isDebugPanelOpen);
  const [events, setEvents] = useState(getDebugEvents);
  const [unread, setUnread] = useState(getUnreadDebugCount);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return subscribeDebugLog(() => {
      setOpen(isDebugPanelOpen());
      setEvents(getDebugEvents());
      setUnread(getUnreadDebugCount());
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        toggleDebugPanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (selectedId && events.some((e) => e.id === selectedId)) return;
    setSelectedId(events[0]?.id ?? null);
  }, [open, events, selectedId]);

  const selected = useMemo(
    () => events.find((e) => e.id === selectedId) ?? null,
    [events, selectedId],
  );

  const copySelected = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(formatDebugEvent(selected));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className={cn(
          "fixed bottom-3 right-3 z-50 inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-full border border-border/70 bg-card px-2 text-muted-foreground shadow-md",
          "hover:bg-muted/70 hover:text-foreground",
        )}
        onClick={() => setDebugPanelOpen(true)}
        title="开发者调试 (Ctrl+Shift+D)"
        aria-label="打开开发者调试"
      >
        <Bug className="size-3.5" />
        {unread > 0 && (
          <Badge variant="destructive" className="min-w-4 justify-center px-1">
            {unread > 99 ? "99+" : unread}
          </Badge>
        )}
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex h-[min(42vh,22rem)] flex-col border-t border-border/70 bg-card text-card-foreground shadow-[0_-8px_32px_rgba(0,0,0,0.18)]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <Bug className="size-3.5 text-muted-foreground" />
        <span className="text-[13px] font-medium">开发者调试</span>
        <span className="text-[11px] text-muted-foreground">Ctrl+Shift+D</span>
        <span className="text-[11px] text-muted-foreground">{events.length} 条</span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={copySelected} disabled={!selected}>
          <Copy className="size-3.5" />
          {copied ? "已复制" : "复制"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => {
            clearDebugEvents();
            setSelectedId(null);
          }}
          disabled={events.length === 0}
        >
          <Trash2 className="size-3.5" />
          清空
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setDebugPanelOpen(false)}
          aria-label="关闭调试面板"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-[13px] text-muted-foreground">
          还没有捕获到错误。API / SSE 失败会显示在这里。
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="w-[min(42%,22rem)] shrink-0 overflow-y-auto border-r border-border/50">
            {events.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => setSelectedId(event.id)}
                className={cn(
                  "flex w-full items-start gap-2 border-b border-border/30 px-3 py-2 text-left text-[12px]",
                  selectedId === event.id ? "bg-primary/10" : "hover:bg-muted/50",
                )}
              >
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                  {clock(event.ts)}
                </span>
                <span className={cn("min-w-0 flex-1 truncate", levelTone(event.level))}>
                  {event.message}
                </span>
                <ChevronDown
                  className={cn(
                    "mt-0.5 size-3 shrink-0 text-muted-foreground",
                    selectedId === event.id ? "rotate-180" : "-rotate-90",
                  )}
                />
              </button>
            ))}
          </div>
          <pre className="min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-[12px] leading-relaxed text-foreground">
            {selected ? formatDebugEvent(selected) : ""}
          </pre>
        </div>
      )}
    </div>
  );
}
