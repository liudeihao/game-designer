import type { PlanProgress } from "../../types";

const TASK_ITEM = /^[-*]\s+\[( |x|X)\]\s+(.+?)\s*$/;

function stepId(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `step-${index + 1}`;
}

function dedupeId(id: string, seen: Set<string>, index: number): string {
  const out = seen.has(id) ? `${id}-${index + 1}` : id;
  seen.add(out);
  return out;
}

/**
 * Same projection as backend plan_progress_from_markdown: the task-list items
 * under「待敲定的设计点」are the open design questions. Checked means settled.
 */
export function planProgressFromMarkdown(markdown: string): PlanProgress {
  const steps: PlanProgress["steps"] = [];
  const seen = new Set<string>();
  for (const raw of (markdown || "").split(/\r?\n/)) {
    const match = raw.trim().match(TASK_ITEM);
    if (!match) continue;
    const title = match[2].trim();
    if (!title) continue;
    const id = dedupeId(stepId(title, steps.length), seen, steps.length);
    steps.push({ id, title, status: match[1].toLowerCase() === "x" ? "done" : "pending" });
  }
  const firstOpen = steps.find((s) => s.status === "pending");
  if (firstOpen) firstOpen.status = "active";
  return { steps };
}
