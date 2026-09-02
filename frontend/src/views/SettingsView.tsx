import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { SettingsPanel } from "../components/SettingsModal";
import { SETTINGS_NAV, type SettingsSection } from "../settingsNav";
import { loadPanelFollowMode, savePanelFollowMode, type PanelFollowMode } from "../studio/panelFollow";
import { cn } from "@/lib/utils";

interface Props {
  onLlmConfiguredChange?: (configured: boolean) => void;
}

const SECTION_IDS: Record<SettingsSection, string> = {
  models: "settings-models",
  rules: "settings-rules",
  workspace: "settings-workspace",
};

export function SettingsView({ onLlmConfiguredChange }: Props) {
  const [panelFollowMode, setPanelFollowMode] = useState<PanelFollowMode>(loadPanelFollowMode);
  const [active, setActive] = useState<SettingsSection>("models");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (!visible.length) return;
        const id = visible[0].target.id;
        const match = (Object.entries(SECTION_IDS) as [SettingsSection, string][]).find(
          ([, elId]) => elId === id,
        );
        if (match) setActive(match[0]);
      },
      { root, rootMargin: "-20% 0px -55% 0px", threshold: [0.1, 0.4, 0.7] },
    );

    for (const id of Object.values(SECTION_IDS)) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const scrollTo = (section: SettingsSection) => {
    setActive(section);
    document.getElementById(SECTION_IDS[section])?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="flex h-full min-h-0 text-foreground">
      <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl gap-10 px-6 py-8 md:px-10">
          <aside className="sticky top-8 hidden h-fit w-40 shrink-0 lg:block">
            <div className="mb-4">
              <h1 className="text-[16px] font-semibold tracking-tight">设置</h1>
              <p className="mt-1 text-[12px] text-muted-foreground">本页目录</p>
            </div>
            <nav className="flex flex-col gap-0.5 border-l border-border/50">
              {SETTINGS_NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollTo(item.id)}
                  className={cn(
                    "-ml-px border-l-2 px-3 py-1.5 text-left text-[13px] transition-colors duration-150",
                    active === item.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 flex-1 pb-16">
            <div className="mb-6 lg:hidden">
              <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SETTINGS_NAV.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollTo(item.id)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[13px] transition-colors",
                      active === item.id
                        ? "bg-primary/12 text-foreground"
                        : "bg-muted/50 text-muted-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <SettingsPanel
              panelFollowMode={panelFollowMode}
              onPanelFollowModeChange={(mode) => {
                setPanelFollowMode(mode);
                savePanelFollowMode(mode);
              }}
              onSaved={() => {
                api.health().then((h) => onLlmConfiguredChange?.(h.llm_configured));
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
