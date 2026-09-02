import { ArrowLeft, Construction } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { COMING_SOON_META } from "../navConfig";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";

export function ComingSoonView() {
  const { pathname } = useLocation();
  const meta = COMING_SOON_META[pathname] ?? {
    title: "即将推出",
    description: "该功能仍在规划中。",
    bullets: ["交互与数据模型待定", "会与现有工作区无缝衔接"],
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto text-foreground">
      <div className="mx-auto flex w-full max-w-2xl flex-col px-8 py-12">
        <Button variant="ghost" size="sm" className="mb-8 w-fit gap-1.5 px-2" asChild>
          <Link to="/">
            <ArrowLeft className="size-3.5" />
            返回首页
          </Link>
        </Button>

        <div className="mb-3 flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <Construction className="size-5 text-primary" />
          </div>
          <Badge variant="warning">即将推出</Badge>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">{meta.title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{meta.description}</p>

        <div className="surface mt-8 p-4">
          <div className="mb-3 text-sm font-medium text-muted-foreground">规划能力</div>
          <ul className="space-y-2">
            {meta.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-[15px]">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/70" />
                {b}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-6 text-[14px] text-muted-foreground">
          路由已预留，后续可直接接入实现，无需再改导航结构。
        </p>
      </div>
    </div>
  );
}
