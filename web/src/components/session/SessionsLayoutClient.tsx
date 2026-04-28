"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLayoutEffect, useState } from "react";
import { SessionListSidebar } from "./SessionListSidebar";
import type { SessionSummary } from "@/lib/types";
import { WorkspaceHorizontalSplit } from "@/components/shell/WorkspaceHorizontalSplit";

/** Tailwind `lg` default (keep in sync with breakpoints). */
const LG_MIN_PX = 1024;

export function SessionsLayoutClient({
  children,
  initialSessionList = [],
}: {
  children: ReactNode;
  initialSessionList?: SessionSummary[];
}) {
  const [sidebarWide, setSidebarWide] = useState(true);
  useLayoutEffect(() => {
    const mq = window.matchMedia(`(min-width: ${LG_MIN_PX}px)`);
    const sync = () => setSidebarWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const main = (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
  );
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-end gap-2 border-b border-divider px-3 py-2 text-ui-mono text-xs lg:hidden">
        <Link href="/library/sessions" className="mr-auto text-text-muted hover:text-accent">
          ← 会话
        </Link>
        <Link href="/library/sessions/new" className="text-accent">
          新会话
        </Link>
      </div>
      {sidebarWide ? (
        <div className="flex min-h-0 min-w-0 flex-1 lg:h-full">
          <WorkspaceHorizontalSplit
            storageKey="layout:sessions-list-sidebar"
            leftDefaultSize={17.5}
            leftMinSize={14}
            rightMinSize={40}
            className="h-full min-h-0 min-w-0 flex-1"
            left={<SessionListSidebar initialSessionList={initialSessionList} />}
            right={main}
          />
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{main}</div>
      )}
    </div>
  );
}
