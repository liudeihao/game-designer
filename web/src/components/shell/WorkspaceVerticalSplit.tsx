"use client";

import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  type LayoutStorage,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";

const ssrStorage: LayoutStorage = {
  getItem: () => null,
  setItem: () => {},
};

type Props = {
  storageKey: string;
  /** Initial height % for the top panel (e.g. message list) */
  topDefaultSize: number;
  topMinSize?: number;
  bottomMinSize?: number;
  className?: string;
  topClassName?: string;
  bottomClassName?: string;
  top: React.ReactNode;
  bottom: React.ReactNode;
};

/**
 * Vertical split (top | bottom). Use for chat history vs composer; input stays in the bottom panel.
 */
export function WorkspaceVerticalSplit({
  storageKey,
  topDefaultSize,
  topMinSize = 18,
  bottomMinSize = 10,
  className,
  topClassName,
  bottomClassName,
  top,
  bottom,
}: Props) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: storageKey,
    panelIds: ["top", "bottom"],
    storage: typeof window !== "undefined" ? window.localStorage : ssrStorage,
  });

  return (
    <Group
      id={storageKey}
      orientation="vertical"
      className={cn("min-h-0 min-w-0 overflow-hidden", className)}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <Panel
        id="top"
        defaultSize={`${topDefaultSize}%`}
        minSize={`${topMinSize}%`}
        className={cn("min-h-0 min-w-0 overflow-hidden", topClassName)}
      >
        {top}
      </Panel>
      <Separator
        className={cn(
          "h-px w-full shrink-0 bg-border/80 outline-none transition-colors",
          "hover:bg-accent/40 focus-visible:bg-accent/50"
        )}
      />
      <Panel
        id="bottom"
        minSize={`${bottomMinSize}%`}
        className={cn("min-h-0 min-w-0 overflow-hidden", bottomClassName)}
      >
        {bottom}
      </Panel>
    </Group>
  );
}
