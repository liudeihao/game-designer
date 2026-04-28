import { cn } from "@/lib/utils";

/** Airy vertical rhythm between session rows (Gemini-like). */
export const sessionSidebarNavListClass = "space-y-2";

/**
 * Row shell: one rounded surface behind title + overflow trigger (library + project sidebars).
 */
export function sessionSidebarSessionRowShellClass(active: boolean) {
  return cn(
    "transition-colors",
    active
      ? "min-h-11 rounded-2xl bg-accent/8 ring-1 ring-inset ring-accent/15"
      : "min-h-10 rounded-xl hover:bg-white/[0.035]"
  );
}

/**
 * Session title link — typography only; background lives on {@link sessionSidebarSessionRowShellClass}.
 */
export function sessionSidebarSessionLinkClass(active: boolean) {
  return cn(
    "font-display flex min-w-0 flex-1 items-center text-[15px] leading-snug outline-none transition-colors",
    active
      ? "min-h-11 py-2 pl-3 pr-1 font-medium text-accent"
      : "min-h-10 py-2 pl-3 pr-1 text-text-muted group-hover:text-text-primary"
  );
}

/**
 * Overflow (⋮) trigger: hidden until row hover, keyboard focus-within, current session, or open menu.
 */
export function sessionSidebarSessionOverflowWrapClass(rowActive: boolean) {
  return cn(
    "flex shrink-0 items-center opacity-0 transition-opacity duration-150",
    "group-hover:opacity-100 group-focus-within:opacity-100",
    "has-[button[data-state=open]]:opacity-100",
    rowActive && "opacity-100"
  );
}

/** Primary "new session" affordance — matches inactive row weight, accent when current. */
export function sessionSidebarNewSessionLinkClass(active: boolean) {
  return cn(
    "inline-flex w-full items-center gap-2 text-[15px] font-medium transition-colors",
    active
      ? "rounded-2xl bg-accent/8 px-3 py-2.5 text-accent ring-1 ring-inset ring-accent/15"
      : "rounded-xl px-3 py-2 text-accent hover:bg-accent/8"
  );
}
