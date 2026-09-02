import type { TracePart } from "../types";

/** Workspace lookup tools — noisy in the chat timeline by default. */
export const INTERNAL_TOOL_TRACE_NAMES = new Set([
  "workspace_list",
  "workspace_read",
  "workspace_grep",
  "conversation_get_summary",
]);

/** User Choice is rendered as its own card — never as a tool TraceCard. */
export const USER_CHOICE_TRACE_NAMES = new Set(["ask_user", "suggest_mode"]);

/** Rule Proposal is its own card — never a tool TraceCard. */
export const RULE_PROPOSAL_TRACE_NAMES = new Set(["propose_rule"]);

const STORAGE_KEY = "gd.showInternalToolTraces";

type Listener = () => void;
const listeners = new Set<Listener>();

export function isInternalToolTrace(trace: Pick<TracePart, "name" | "kind">): boolean {
  if (trace.kind && trace.kind !== "tool") return false;
  return INTERNAL_TOOL_TRACE_NAMES.has(trace.name);
}

export function isCompactionTrace(trace: Pick<TracePart, "name" | "kind">): boolean {
  return trace.kind === "compaction" || trace.name === "compact_context";
}

/** Specialist body under a Studio handoff — same label as the parent, hide as its own card. */
export function isCapabilityShell(trace: Pick<TracePart, "name" | "kind">): boolean {
  return trace.kind === "capability";
}

/**
 * Traces are a flat tool list. Historical nested cards are shown as stored.
 */
export function normalizeTracesForDisplay(traces: TracePart[]): TracePart[] {
  return traces;
}

/** Every tool call is shown unless the user opted out. */
export function loadShowInternalToolTraces(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== "0";
}

export function saveShowInternalToolTraces(show: boolean) {
  localStorage.setItem(STORAGE_KEY, show ? "1" : "0");
  listeners.forEach((fn) => fn());
}

export function subscribeShowInternalToolTraces(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function filterToolNoise(traces: TracePart[], showInternal: boolean): TracePart[] {
  const out: TracePart[] = [];
  for (const t of traces) {
    if (isCompactionTrace(t)) continue;
    if (USER_CHOICE_TRACE_NAMES.has(t.name)) continue;
    if (RULE_PROPOSAL_TRACE_NAMES.has(t.name)) continue;
    if (!showInternal && isInternalToolTrace(t)) continue;
    const children = t.children?.length
      ? filterToolNoise(t.children, showInternal)
      : t.children;
    out.push(children === t.children ? t : { ...t, children });
  }
  return out;
}

/** Drop noisy internal tool cards. */
export function filterVisibleTraces(
  traces: TracePart[],
  showInternal: boolean,
): TracePart[] {
  return filterToolNoise(normalizeTracesForDisplay(traces), showInternal);
}
