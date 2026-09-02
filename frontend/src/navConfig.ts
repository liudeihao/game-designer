import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  FolderKanban,
  Home,
  LayoutTemplate,
  Library,
  Settings,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** When true, route shows Coming Soon placeholder */
  soon?: boolean;
  end?: boolean;
};

export type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "workspace",
    label: "工作区",
    items: [{ to: "/", label: "首页", icon: Home, end: true }],
  },
  {
    id: "create",
    label: "创作",
    items: [
      { to: "/projects", label: "项目", icon: FolderKanban },
      { to: "/templates", label: "模板", icon: LayoutTemplate, soon: true },
      { to: "/library", label: "资产库", icon: Library, soon: true },
    ],
  },
  {
    id: "insights",
    label: "洞察",
    items: [{ to: "/analytics", label: "用量分析", icon: BarChart3 }],
  },
];

export const NAV_FOOTER: NavItem[] = [{ to: "/settings", label: "设置", icon: Settings }];

export const COMING_SOON_META: Record<
  string,
  { title: string; description: string; bullets: string[] }
> = {
  "/templates": {
    title: "项目模板",
    description: "从品类模板快速起步：Roguelike、开放世界、卡牌等。",
    bullets: ["官方品类模板", "社区模板市场", "一键生成初始 Plan"],
  },
  "/library": {
    title: "资产库",
    description: "跨项目复用图像、音频、UI 组件与机制片段。",
    bullets: ["资产浏览与标签", "从设计文档导入", "版本与审批历史"],
  },
};
