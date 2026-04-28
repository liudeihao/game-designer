"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Box, Compass, LayoutGrid, MessageSquare, Settings, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { DevLoginButton } from "@/components/dev/DevLoginButton";
import { useLogoutAndRedirect } from "@/components/auth/LogoutButton";
import type { Me } from "@/lib/types";

function userAvatarInitial(me: Me): string {
  const raw = (me.displayName ?? me.username).trim();
  if (!raw.length) return "?";
  const first = [...raw][0];
  return first ? first.toLocaleUpperCase() : "?";
}

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
  const logoutAndRedirect = useLogoutAndRedirect();
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
  const prefsActive = pathname.startsWith("/library/preferences");

  return (
    <div className="flex h-svh min-h-0">
      <aside className="fixed left-0 top-0 z-40 flex h-full w-12 flex-col items-stretch border-r border-border bg-bg-base/95 py-3">
        <div className="flex flex-col items-center gap-1">
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
        </div>
        <div className="mt-auto flex flex-col items-center gap-2 border-t border-border/60 px-0.5 pt-2 text-ui-mono text-xs leading-tight text-text-muted">
          {me ? (
            <>
              <Link
                href="/library/preferences"
                title="显示与字体"
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                  prefsActive
                    ? "bg-accent/15 text-accent"
                    : "text-text-muted/80 hover:bg-white/5 hover:text-text-primary"
                )}
              >
                <Settings className="h-4 w-4" />
              </Link>
              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    title={me.displayName ?? me.username}
                    aria-label={`${me.displayName ?? me.username}，账户菜单`}
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-accent/10 text-sm font-medium text-text-primary outline-none",
                      "hover:border-accent/40 hover:bg-accent/15 focus-visible:ring-2 focus-visible:ring-accent/40"
                    )}
                  >
                    {userAvatarInitial(me)}
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="text-ui-mono z-[200] min-w-[7rem] rounded-md border border-border bg-bg-base p-1 shadow-lg"
                    side="right"
                    align="end"
                    sideOffset={6}
                  >
                    <DropdownMenu.Item
                      className={cn(
                        "cursor-pointer rounded px-2 py-1.5 text-sm text-text-primary outline-none",
                        "hover:bg-white/5 focus:bg-white/5 data-[highlighted]:bg-white/5"
                      )}
                      onSelect={(e) => {
                        e.preventDefault();
                        void logoutAndRedirect();
                      }}
                    >
                      退出
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md px-1 py-1.5 text-center text-xs text-accent hover:underline"
            >
              登录
            </Link>
          )}
        </div>
      </aside>
      <div className="flex min-h-0 flex-1 flex-col pl-12">
        <motion.main
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          initial={{ x: 12, opacity: 0.9 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col",
              // Library + sessions: viewport height is fixed here; scroll only inside sidebar / main panels.
              pathname.startsWith("/library/assets") ||
              pathname.startsWith("/library/sessions") ||
              (pathname.startsWith("/projects/") &&
                pathname.split("/")[2] !== "new" &&
                pathname.split("/").length >= 3)
                ? "overflow-hidden"
                : "gd-scrollbar overflow-y-auto"
            )}
          >
            {children}
          </div>
        </motion.main>
      </div>
      <DevLoginButton />
    </div>
  );
}
