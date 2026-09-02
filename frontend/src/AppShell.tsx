import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api";
import { SideNav } from "./components/SideNav";
import { NewProjectWizard } from "./components/NewProjectWizard";
import { ComingSoonView } from "./views/ComingSoonView";
import { DashboardView } from "./views/DashboardView";
import { ProjectsView } from "./views/ProjectsView";
import { AnalyticsView } from "./views/AnalyticsView";
import { SettingsView } from "./views/SettingsView";
import { StudioView } from "./studio/StudioView";
import { DevDebugPanel } from "./debug/DevDebugPanel";

const COMING_SOON_PATHS = ["/templates", "/library"] as const;

export default function AppShell() {
  const [llmConfigured, setLlmConfigured] = useState(false);
  const location = useLocation();
  const isWorkspace = location.pathname.startsWith("/project/");

  useEffect(() => {
    api.health().then((h) => setLlmConfigured(h.llm_configured));
  }, []);

  return (
    <div className="shell-atmosphere flex h-screen overflow-hidden text-foreground">
      {!isWorkspace && <SideNav llmConfigured={llmConfigured} />}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden panel-fade-in">
        <Routes>
          <Route path="/" element={<DashboardView />} />
          <Route path="/projects" element={<ProjectsView />} />
          <Route path="/new" element={<NewProjectWizard />} />
          <Route path="/analytics" element={<AnalyticsView />} />
          <Route
            path="/project/:projectId"
            element={<StudioView onLlmConfiguredChange={setLlmConfigured} />}
          />
          <Route
            path="/settings"
            element={<SettingsView onLlmConfiguredChange={setLlmConfigured} />}
          />
          {COMING_SOON_PATHS.map((path) => (
            <Route key={path} path={path} element={<ComingSoonView />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <DevDebugPanel />
    </div>
  );
}
