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
  const { defaultLayout, onLayoutChange, onLayoutChanged } = useDefaultLayout({
    id: storageKey,
    panelIds: ["top", "bottom"],
    storage: typeof window !== "undefined" ? window.localStorage : ssrStorage,
  });

  return (
    <Group
      id={storageKey}
      orientation="vertical"
      className={cn("h-full min-h-0 min-w-0 overflow-hidden", className)}
      defaultLayout={defaultLayout}
      onLayoutChange={onLayoutChange}
      onLayoutChanged={onLayoutChanged}
      resizeTargetMinimumSize={{ fine: 8, coarse: 32 }}
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
        aria-label="拖动调整上下区域高度"
        title="拖动调整聊天记录区与输入区比例"
        className={cn(
          // Tall-enough hit band; thin line drawn with ::before (library owns flex-shrink on Separator).
          "relative z-20 box-border w-full cursor-row-resize py-2 outline-none",
          "bg-transparent before:pointer-events-none",
          "before:absolute before:left-0 before:right-0 before:top-1/2 before:h-px before:-translate-y-1/2 before:bg-divider before:content-['']",
          "hover:before:bg-accent/45 focus-visible:before:bg-accent/55"
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
