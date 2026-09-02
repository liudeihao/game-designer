import type { ComponentProps } from "react";
import { Group, Panel, Separator, type GroupProps, type PanelProps } from "react-resizable-panels";
import { cn } from "@/lib/utils";

const ResizablePanelGroup = ({ className, ...props }: GroupProps) => (
  <Group className={cn("h-full w-full", className)} {...props} />
);

const ResizablePanel = ({ className, ...props }: PanelProps) => (
  <Panel className={cn("min-h-0 min-w-0 overflow-hidden", className)} {...props} />
);

const ResizableHandle = ({
  className,
  ...props
}: ComponentProps<typeof Separator>) => (
  <Separator
    className={cn(
      "group relative w-1.5 shrink-0 bg-transparent outline-none transition-colors",
      "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border after:transition-[background,width]",
      "hover:after:w-0.5 hover:after:bg-primary/50",
      "data-[separator]:focus-visible:after:w-0.5 data-[separator]:focus-visible:after:bg-primary",
      className,
    )}
    {...props}
  />
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
