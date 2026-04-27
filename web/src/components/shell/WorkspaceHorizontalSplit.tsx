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
  const { defaultLayout, onLayoutChange, onLayoutChanged } = useDefaultLayout({
    id: storageKey,
    panelIds: ["left", "right"],
    storage: typeof window !== "undefined" ? window.localStorage : ssrStorage,
  });
  const rightDefault = Math.max(0, 100 - leftDefaultSize);

  return (
    <Group
      id={storageKey}
      orientation="horizontal"
      className={cn("flex h-full min-h-0 min-w-0 overflow-hidden", className)}
      defaultLayout={defaultLayout}
      onLayoutChange={onLayoutChange}
      onLayoutChanged={onLayoutChanged}
      resizeTargetMinimumSize={{ fine: 6, coarse: 28 }}
    >
      <Panel
        id="left"
        defaultSize={`${leftDefaultSize}%`}
        minSize={`${leftMinSize}%`}
        className={cn("min-h-0 min-w-0 overflow-hidden", leftClassName)}
      >
        {left}
      </Panel>
      <Separator
        className={cn(
          // Do not set flex-shrink here; the library owns flex-shrink on Separator (see package docs).
          "relative z-20 w-px cursor-col-resize self-stretch outline-none transition-colors",
          "bg-divider hover:bg-accent/45 focus-visible:bg-accent/55"
        )}
      />
      <Panel
        id="right"
        defaultSize={`${rightDefault}%`}
        minSize={`${rightMinSize}%`}
        className={cn("min-h-0 min-w-0 overflow-hidden", rightClassName)}
      >
        {right}
      </Panel>
    </Group>
  );
}
