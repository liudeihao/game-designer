import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "box-border flex min-h-[80px] w-full resize-y rounded-md border border-solid border-input/70 bg-muted/30 px-3 py-2.5 text-[15px] leading-5 text-foreground shadow-none transition-[border-color,box-shadow,background-color]",
        "placeholder:text-muted-foreground",
        "focus-visible:border-ring focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
