import type { RightView } from "../components/RightViewSwitcher";

export function loadWidth(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function loadRightView(fallback: RightView = "workspace"): RightView {
  const raw = localStorage.getItem("gd.rightView");
  if (raw === "workspace" || raw === "plan") return raw;
  return fallback;
}

export function persistRightView(view: RightView) {
  localStorage.setItem("gd.rightView", view);
}

/** Convert persisted pixel width to approximate percent for a ~1400px workspace. */
export function pxToPercent(px: number, fallback: number): number {
  const total = 1400;
  return Math.min(45, Math.max(10, Math.round((px / total) * 100) || fallback));
}

export function persistPanelLayouts(layout: { [id: string]: number }) {
  const total = 1400;
  if (layout.right != null) {
    localStorage.setItem("gd.rightWidth", String(Math.round((layout.right / 100) * total)));
  }
}
