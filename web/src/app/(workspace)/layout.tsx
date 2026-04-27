import { WorkspaceShell } from "@/components/shell/WorkspaceShell";
import { loadMe } from "@/lib/server-api";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const me = await loadMe();
  return <WorkspaceShell me={me}>{children}</WorkspaceShell>;
}
