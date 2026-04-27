"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  applyUiPreferencesToDocument,
  readUiPreferences,
  writeUiPreferences,
  type UiPreferences,
} from "@/lib/ui-preferences";

const Ctx = createContext<{
  prefs: UiPreferences;
  setPrefs: (p: Partial<UiPreferences>) => void;
} | null>(null);

const defaultPrefs: UiPreferences = {
  fontScale: "md",
  libraryCardSize: "md",
};

export function UiPreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState<UiPreferences>(defaultPrefs);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(readUiPreferences());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) applyUiPreferencesToDocument(prefs);
  }, [prefs, ready]);

  const setPrefs = useMemo(
    () => (p: Partial<UiPreferences>) => {
      setState((prev) => writeUiPreferences(p, prev));
    },
    []
  );

  return <Ctx.Provider value={{ prefs, setPrefs }}>{children}</Ctx.Provider>;
}

export function useUiPreferences() {
  const v = useContext(Ctx);
  if (!v) {
    return {
      prefs: readUiPreferences(),
      setPrefs: () => {},
    };
  }
  return v;
}
