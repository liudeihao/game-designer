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
        aria-label="拖动调整左右区域宽度"
        title="拖动调整左右区域宽度"
        className={cn(
          // Wider hit band (px); thin line via ::before — mirror WorkspaceVerticalSplit py + before pattern.
          // Do not set flex-shrink here; the library owns flex-shrink on Separator (see package docs).
          "relative z-20 box-border cursor-col-resize self-stretch px-2 outline-none",
          "bg-transparent before:pointer-events-none",
          "before:absolute before:bottom-0 before:left-1/2 before:top-0 before:w-px before:-translate-x-1/2 before:bg-divider before:content-['']",
          "hover:before:bg-accent/45 focus-visible:before:bg-accent/55"
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
