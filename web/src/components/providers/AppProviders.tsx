"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { UiPreferencesProvider } from "./UiPreferencesProvider";

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
      <UiPreferencesProvider>{children}</UiPreferencesProvider>
    </QueryClientProvider>
  );
}
