"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * AI chat column shell: L-corner marks stay on the panel; top accent line spans from the
 * workspace icon rail to the viewport right edge (fixed), with vertical position synced to
 * this panel's top (resize + scroll on ancestors).
 */
export function GdEditorPanel({ children, className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bladeRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const blade = bladeRef.current;
    if (!root || !blade) return;

    const syncTop = () => {
      const top = root.getBoundingClientRect().top;
      blade.style.top = `${Math.round(top)}px`;
    };

    syncTop();

    const ro = new ResizeObserver(syncTop);
    ro.observe(root);

    window.addEventListener("resize", syncTop);
    window.addEventListener("scroll", syncTop, true);

    // `WorkspaceShell` main uses a short Framer Motion x slide; sync top while transform runs.
    const motionUntil = performance.now() + 280;
    let rafId = 0;
    const motionTick = () => {
      syncTop();
      if (performance.now() < motionUntil) {
        rafId = window.requestAnimationFrame(motionTick);
      }
    };
    rafId = window.requestAnimationFrame(motionTick);

    return () => {
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("resize", syncTop);
      window.removeEventListener("scroll", syncTop, true);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={cn(
        "gd-editor-panel relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0">
        <span
          ref={bladeRef}
          className="gd-editor-panel__blade gd-editor-panel__blade--workspace-rail"
          aria-hidden
        />
        <span className="gd-editor-panel__corners" aria-hidden />
      </div>
      {children}
    </div>
  );
}
