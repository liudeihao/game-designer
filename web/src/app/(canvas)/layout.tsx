import { WorkspaceShell } from "@/components/shell/WorkspaceShell";

export default function CanvasLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell hideNav>{children}</WorkspaceShell>;
}
