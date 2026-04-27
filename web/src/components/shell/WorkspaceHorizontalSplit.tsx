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
      className={cn("flex h-full min-h-0 min-w-0 overflow-hidden", className)}
      defaultLayout={defaultLayout}
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
          // Wider hit target than 1px so drag is discoverable; library also expands rects to min size.
          "relative z-20 min-w-2 max-w-2 shrink-0 cursor-col-resize self-stretch outline-none transition-colors",
          "bg-divider hover:bg-accent/45 focus-visible:bg-accent/55"
        )}
      />
      <Panel
        id="right"
        minSize={`${rightMinSize}%`}
        className={cn("min-h-0 min-w-0 overflow-hidden", rightClassName)}
      >
        {right}
      </Panel>
    </Group>
  );
}
