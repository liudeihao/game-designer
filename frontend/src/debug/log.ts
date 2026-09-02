export type DebugLevel = "error" | "warn" | "info";
export type DebugSource = "http" | "network" | "sse" | "app";

export interface DebugEvent {
  id: string;
  ts: number;
  level: DebugLevel;
  source: DebugSource;
  message: string;
  method?: string;
  url?: string;
  status?: number;
  statusText?: string;
  body?: string;
  durationMs?: number;
  stack?: string;
  detail?: unknown;
}

const MAX_EVENTS = 200;
const OPEN_KEY = "gd.debugPanelOpen";

type Listener = () => void;

let events: DebugEvent[] = [];
let open = localStorage.getItem(OPEN_KEY) === "1";
let unread = 0;
let seq = 0;

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribeDebugLog(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getDebugEvents(): DebugEvent[] {
  return events;
}

export function getUnreadDebugCount(): number {
  return unread;
}

export function isDebugPanelOpen(): boolean {
  return open;
}

export function setDebugPanelOpen(next: boolean) {
  open = next;
  localStorage.setItem(OPEN_KEY, next ? "1" : "0");
  if (next) unread = 0;
  emit();
}

export function toggleDebugPanel() {
  setDebugPanelOpen(!open);
}

export function openDebugPanel() {
  setDebugPanelOpen(true);
}

export function clearDebugEvents() {
  events = [];
  unread = 0;
  emit();
}

export function pushDebugEvent(partial: Omit<DebugEvent, "id" | "ts"> & { ts?: number }) {
  const event: DebugEvent = {
    ...partial,
    id: `dbg_${Date.now().toString(36)}_${++seq}`,
    ts: partial.ts ?? Date.now(),
  };
  events = [event, ...events].slice(0, MAX_EVENTS);
  if (!open && event.level === "error") unread += 1;
  emit();
}

export function formatDebugEvent(event: DebugEvent): string {
  const time = new Date(event.ts).toISOString();
  const lines = [
    `[${time}] ${event.level.toUpperCase()} ${event.source}`,
    event.message,
  ];
  if (event.method || event.url) {
    lines.push(`${event.method ?? "?"} ${event.url ?? ""}`.trim());
  }
  if (event.status != null) {
    lines.push(`status: ${event.status} ${event.statusText ?? ""}`.trim());
  }
  if (event.durationMs != null) lines.push(`duration: ${event.durationMs}ms`);
  if (event.body) {
    lines.push("body:");
    lines.push(event.body);
  }
  if (event.stack) {
    lines.push("stack:");
    lines.push(event.stack);
  }
  if (event.detail != null) {
    lines.push("detail:");
    try {
      lines.push(JSON.stringify(event.detail, null, 2));
    } catch {
      lines.push(String(event.detail));
    }
  }
  return lines.join("\n");
}
