import { Bot, Image, LayoutPanelLeft, ScrollText } from "lucide-react";

export type SettingsSection = "models" | "image-models" | "rules" | "workspace";

export const SETTINGS_NAV: {
  id: SettingsSection;
  label: string;
  icon: typeof Bot;
}[] = [
  { id: "models", label: "模型", icon: Bot },
  { id: "image-models", label: "图像模型", icon: Image },
  { id: "rules", label: "User Rule", icon: ScrollText },
  { id: "workspace", label: "工作区", icon: LayoutPanelLeft },
];
