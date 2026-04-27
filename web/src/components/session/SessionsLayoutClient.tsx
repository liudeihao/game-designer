"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { SessionListSidebar } from "./SessionListSidebar";
import type { SessionSummary } from "@/lib/types";

export function SessionsLayoutClient({
  children,
  initialSessionList = [],
}: {
  children: ReactNode;
  initialSessionList?: SessionSummary[];
}) {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-divider px-3 py-2 text-ui-mono text-[12px] lg:hidden">
        <Link href="/library/sessions" className="text-text-muted hover:text-accent">
          ← 会话
        </Link>
        <Link href="/library/sessions/new" className="text-accent">
          新会话
        </Link>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
        <SessionListSidebar initialSessionList={initialSessionList} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
