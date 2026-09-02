import type { ComponentType } from "react";
import { Plus } from "lucide-react";
import { NavLink } from "react-router-dom";
import { NAV_FOOTER, NAV_SECTIONS } from "../navConfig";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  llmConfigured: boolean;
}

function NavItemLink({
  to,
  label,
  icon: Icon,
  soon,
  end,
}: {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  soon?: boolean;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "group flex h-9 items-center gap-2 rounded-md px-2.5 text-[14px] transition-colors duration-150",
          isActive
            ? "bg-primary/12 text-foreground"
            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        )
      }
    >
      <Icon className="size-3.5 shrink-0 opacity-80" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {soon && (
        <span className="text-[10px] font-medium text-muted-foreground/60 group-hover:text-muted-foreground">
          Soon
        </span>
      )}
    </NavLink>
  );
}

export function SideNav({ llmConfigured }: Props) {
  return (
    <nav className="flex h-full w-[220px] shrink-0 flex-col border-r border-border/50 bg-background text-foreground">
      <div className="px-3 pb-3 pt-5">
        <div className="px-1.5">
          <div className="text-[16px] font-semibold tracking-tight">AI Game Studio</div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">游戏设计工作台</div>
        </div>
        <Button asChild size="sm" className="mt-4 w-full justify-start gap-1.5">
          <NavLink to="/new">
            <Plus className="size-3.5" />
            新建项目
          </NavLink>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.id} className="mb-5">
            <div className="mb-1.5 px-2.5 text-[13px] font-medium text-muted-foreground">
              {section.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavItemLink key={item.to} {...item} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto border-t border-border/50 px-2 py-3">
        <div className="mb-2 flex flex-col gap-0.5">
          {NAV_FOOTER.map((item) => (
            <NavItemLink key={item.to} {...item} />
          ))}
        </div>
        <div className="mb-1 flex justify-end px-0.5">
          <ThemeToggle />
        </div>
        <div className="px-1.5 pb-0.5">
          <Badge variant={llmConfigured ? "success" : "warning"} className="w-full justify-center">
            {llmConfigured ? "已连接模型" : "未配置模型"}
          </Badge>
        </div>
      </div>
    </nav>
  );
}
