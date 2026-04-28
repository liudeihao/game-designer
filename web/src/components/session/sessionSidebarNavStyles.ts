import { cn } from "@/lib/utils";

/** Airy vertical rhythm between session rows (Gemini-like). */
export const sessionSidebarNavListClass = "space-y-2";

/**
 * Session title link: larger type; active = generous padding + large corner radius + soft ring.
 */
export function sessionSidebarSessionLinkClass(active: boolean) {
  return cn(
    "flex min-w-0 flex-1 items-center text-[15px] leading-snug transition-colors outline-none",
    active
      ? "min-h-11 rounded-2xl bg-accent/14 px-3 py-2 font-medium text-accent ring-1 ring-inset ring-accent/25"
      : "min-h-10 rounded-xl px-3 py-2 text-text-muted hover:bg-white/[0.06] hover:text-text-primary"
  );
}

/** Primary "new session" affordance — matches inactive row weight, accent when current. */
export function sessionSidebarNewSessionLinkClass(active: boolean) {
  return cn(
    "inline-flex w-full items-center gap-2 text-[15px] font-medium transition-colors",
    active
      ? "rounded-2xl bg-accent/14 px-3 py-2.5 text-accent ring-1 ring-inset ring-accent/25"
      : "rounded-xl px-3 py-2 text-accent hover:bg-accent/10"
  );
}
