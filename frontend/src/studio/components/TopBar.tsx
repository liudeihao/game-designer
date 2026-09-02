import { ChevronDown, Home, Pencil, Plus, Settings, Trash2 } from "lucide-react";
import type { ProjectMeta } from "../../types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import { ThemeToggle } from "../../components/ThemeToggle";

interface Props {
  projects: ProjectMeta[];
  currentId: string | null;
  llmConfigured: boolean;
  onHome?: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
}

export function TopBar({
  projects,
  currentId,
  llmConfigured,
  onHome,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onSettings,
}: Props) {
  const current = projects.find((p) => p.id === currentId);

  return (
    <TooltipProvider delayDuration={300}>
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 bg-background px-3">
        {onHome && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onHome} aria-label="返回首页">
                <Home />
              </Button>
            </TooltipTrigger>
            <TooltipContent>返回首页</TooltipContent>
          </Tooltip>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 max-w-[200px] gap-1.5 px-2 font-medium">
              <span className="truncate">{current ? current.name : "选择项目"}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel>项目</DropdownMenuLabel>
            {projects.length === 0 && (
              <div className="px-2 py-3 text-[14px] text-muted-foreground">还没有项目</div>
            )}
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                className="group flex items-start justify-between gap-2"
                onSelect={() => onSelect(p.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="truncate text-[13px] text-muted-foreground">
                    {new Date(p.updated_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    type="button"
                    className="rounded p-1 hover:bg-muted"
                    title="重命名"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRename(p.id);
                    }}
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-destructive hover:bg-muted"
                    title="删除"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(p.id);
                    }}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCreate}>
              <Plus className="size-3.5" />
              新建项目
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Badge variant={llmConfigured ? "success" : "warning"} className="shrink-0">
          {llmConfigured ? "已连接" : "未配置"}
        </Badge>

        <div className="flex-1" />

        <ThemeToggle />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onSettings} aria-label="工作区设置">
              <Settings />
            </Button>
          </TooltipTrigger>
          <TooltipContent>工作区设置</TooltipContent>
        </Tooltip>
      </header>
    </TooltipProvider>
  );
}
