"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import "sonner/dist/styles.css";
import { UiPreferencesProvider, useUiPreferences } from "./UiPreferencesProvider";

function ThemedToaster() {
  const { prefs } = useUiPreferences();
  return (
    <Toaster
      theme={prefs.colorScheme}
      position="bottom-center"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "gd-toast border border-border/60 bg-surface text-text-primary shadow-lg backdrop-blur-sm",
          title: "text-sm font-medium text-text-primary",
          description: "text-xs text-text-muted",
          closeButton: "text-text-muted hover:text-text-primary",
        },
      }}
    />
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, throwOnError: false },
          mutations: { throwOnError: false },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <UiPreferencesProvider>
        {children}
        <ThemedToaster />
      </UiPreferencesProvider>
    </QueryClientProvider>
  );
}
