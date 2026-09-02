import { FileText, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../../components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";

export type RightView = "workspace" | "plan";

const VIEWS: {
  id: RightView;
  label: string;
  icon: typeof Folder;
}[] = [
  { id: "workspace", label: "资源管理器", icon: Folder },
  { id: "plan", label: "plan", icon: FileText },
];

interface Props {
  value: RightView;
  onChange: (view: RightView) => void;
  planBadge?: boolean;
}

export function RightViewSwitcher({ value, onChange, planBadge }: Props) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-border/50 bg-muted/20 px-1.5">
        {VIEWS.map((view) => {
          const Icon = view.icon;
          const active = value === view.id;
          return (
            <Tooltip key={view.id}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={active}
                  aria-label={view.label}
                  onClick={() => onChange(view.id)}
                  className={cn(
                    "h-7 gap-1.5 px-2 text-[13px] font-medium text-muted-foreground",
                    active && "bg-background text-foreground shadow-sm",
                  )}
                >
                  <Icon className="size-3.5" />
                  <span>{view.label}</span>
                  {view.id === "plan" && planBadge && (
                    <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{view.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
