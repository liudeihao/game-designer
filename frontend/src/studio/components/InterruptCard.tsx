import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared chrome for User Choice / Suggest Plan cards in the chat column. */
export function InterruptCard({
  title,
  subtitle,
  children,
  footer,
  embedded,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  embedded?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full max-w-2xl overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border/40",
        embedded ? "mx-auto" : "mx-auto mb-2",
        className,
      )}
    >
      <div className="border-b border-border/40 px-3 py-2.5">
        <div className="text-[15px] font-semibold">{title}</div>
        {subtitle ? (
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {children}
      {footer ? <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-2.5">{footer}</div> : null}
    </div>
  );
}
