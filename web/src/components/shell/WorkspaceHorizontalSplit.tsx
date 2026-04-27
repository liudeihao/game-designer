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
  /** Uniquely identifies this split for persisted layout in localStorage */
  storageKey: string;
  /** Initial / fallback width % for the left panel */
  leftDefaultSize: number;
  /** Minimum width % for left panel */
  leftMinSize?: number;
  /** Minimum width % for right panel */
  rightMinSize?: number;
  className?: string;
  leftClassName?: string;
  rightClassName?: string;
  left: React.ReactNode;
  right: React.ReactNode;
};

/**
 * Horizontal split for workspace main area. Shell rail + top bar stay fixed.
 */
export function WorkspaceHorizontalSplit({
  storageKey,
  leftDefaultSize,
  leftMinSize = 12,
  rightMinSize = 30,
  className,
  leftClassName,
  rightClassName,
  left,
  right,
}: Props) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: storageKey,
    panelIds: ["left", "right"],
    storage: typeof window !== "undefined" ? window.localStorage : ssrStorage,
  });

  return (
    <Group
      id={storageKey}
      orientation="horizontal"
      className={cn("min-h-0 min-w-0", className)}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <Panel
        id="left"
        defaultSize={`${leftDefaultSize}%`}
        minSize={`${leftMinSize}%`}
        className={cn("min-h-0 min-w-0", leftClassName)}
      >
        {left}
      </Panel>
      <Separator
        className={cn(
          "w-px shrink-0 bg-border/80 outline-none transition-colors",
          "hover:bg-accent/40 focus-visible:bg-accent/50"
        )}
      />
      <Panel id="right" minSize={`${rightMinSize}%`} className={cn("min-h-0 min-w-0", rightClassName)}>
        {right}
      </Panel>
    </Group>
  );
}
