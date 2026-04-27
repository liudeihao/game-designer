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
  /** Initial height % for the bottom panel (composer); defaults to remainder of topDefaultSize */
  bottomDefaultSize?: number;
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
  bottomDefaultSize,
  topMinSize = 18,
  bottomMinSize = 10,
  className,
  topClassName,
  bottomClassName,
  top,
  bottom,
}: Props) {
  const bottomDefault = bottomDefaultSize ?? Math.max(0, 100 - topDefaultSize);
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
      resizeTargetMinimumSize={{ fine: 6, coarse: 28 }}
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
          "relative z-20 min-h-2 max-h-2 w-full shrink-0 cursor-row-resize outline-none transition-colors",
          "bg-border/80 hover:bg-accent/40 focus-visible:bg-accent/50"
        )}
      />
      <Panel
        id="bottom"
        defaultSize={`${bottomDefault}%`}
        minSize={`${bottomMinSize}%`}
        className={cn("min-h-0 min-w-0 overflow-hidden", bottomClassName)}
      >
        {bottom}
      </Panel>
    </Group>
  );
}
