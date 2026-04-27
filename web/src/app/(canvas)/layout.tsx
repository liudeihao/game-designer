import { WorkspaceShell } from "@/components/shell/WorkspaceShell";
import { loadMe } from "@/lib/server-api";

export default async function CanvasLayout({ children }: { children: React.ReactNode }) {
  const me = await loadMe();
  return (
    <WorkspaceShell hideNav me={me}>
      {children}
    </WorkspaceShell>
  );
}
