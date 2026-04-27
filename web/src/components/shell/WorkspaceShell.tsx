"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Compass, LayoutGrid, MessageSquare, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { DevLoginButton } from "@/components/dev/DevLoginButton";
import { LogoutButton } from "@/components/auth/LogoutButton";
import type { Me } from "@/lib/types";

export function WorkspaceShell({
  children,
  hideNav,
  me,
}: {
  children: React.ReactNode;
  hideNav?: boolean;
  me: Me | null;
}) {
  const pathname = usePathname();
  const userHref = me ? `/u/${me.username}` : "/login";
  if (hideNav) {
    return (
      <>
        {children}
        <DevLoginButton />
      </>
    );
  }
  const nav: { href: string; icon: LucideIcon; label: string }[] = [
    { href: "/explore", icon: Compass, label: "探索" },
    { href: "/library/assets", icon: Box, label: "我的库" },
    { href: "/library/sessions", icon: MessageSquare, label: "会话" },
    { href: "/projects", icon: LayoutGrid, label: "项目" },
    { href: userHref, icon: User, label: "用户" },
  ];
  return (
    <div className="flex min-h-screen">
      <aside className="fixed left-0 top-0 z-40 flex h-full w-12 flex-col items-center border-r border-border bg-bg-base/95 py-3 gap-1">
        {nav.map((n) => {
          const active =
            n.href === "/explore"
              ? pathname.startsWith("/explore")
              : n.href === "/library/assets"
                ? pathname.startsWith("/library/assets") || pathname === "/library"
                : n.href === "/library/sessions"
                  ? pathname.startsWith("/library/sessions")
                  : n.href === "/projects"
                    ? pathname.startsWith("/projects")
                    : n.icon === User
                      ? pathname.startsWith("/u/") || pathname === "/login"
                      : pathname.startsWith(n.href);
          return (
            <Link
              key={n.label + n.href}
              href={n.href}
              title={n.label}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-md",
                active ? "bg-accent/15 text-accent" : "text-text-muted/80 hover:bg-white/5 hover:text-text-primary"
              )}
            >
              <n.icon className="h-4 w-4" />
            </Link>
          );
        })}
      </aside>
      <div className="flex min-h-screen flex-1 flex-col pl-12">
        <header className="flex h-10 shrink-0 items-center justify-end gap-3 border-b border-border/60 px-4 text-ui-mono text-xs text-text-muted">
          {me ? (
            <>
              <span className="text-text-primary/90">{me.displayName ?? me.username}</span>
              <LogoutButton />
            </>
          ) : (
            <Link href="/login" className="hover:text-accent">
              登录
            </Link>
          )}
        </header>
        <motion.main
          className="min-h-0 flex-1"
          initial={{ x: 12, opacity: 0.9 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.main>
      </div>
      <DevLoginButton />
    </div>
  );
}
