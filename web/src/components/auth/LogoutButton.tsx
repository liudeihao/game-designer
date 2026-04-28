"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { logoutAccount } from "@/lib/api";

export function useLogoutAndRedirect() {
  const router = useRouter();
  return useCallback(async () => {
    await logoutAccount();
    router.refresh();
    router.push("/explore");
  }, [router]);
}

export function LogoutButton({ className }: { className?: string }) {
  const logout = useLogoutAndRedirect();
  return (
    <button
      type="button"
      className={cn("text-ui-mono text-text-muted hover:text-text-primary", className)}
      title="退出"
      onClick={() => void logout()}
    >
      退出
    </button>
  );
}
