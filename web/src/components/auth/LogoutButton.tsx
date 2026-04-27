"use client";

import { useRouter } from "next/navigation";
import { logoutAccount } from "@/lib/api";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-ui-mono text-text-muted hover:text-text-primary"
      onClick={async () => {
        await logoutAccount();
        router.refresh();
        router.push("/explore");
      }}
    >
      退出
    </button>
  );
}
