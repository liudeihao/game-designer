/** Common project status tags; users can also set a custom string. */
export const PROJECT_LABEL_PRESETS = ["构思", "进行中", "Done"] as const;

export function projectLabelVariant(
  label: string | undefined,
): "default" | "secondary" | "success" | "warning" {
  const t = (label || "").trim();
  if (!t) return "secondary";
  if (t === "Done" || t === "已完成") return "success";
  if (t === "进行中") return "default";
  if (t === "构思") return "warning";
  return "secondary";
}
