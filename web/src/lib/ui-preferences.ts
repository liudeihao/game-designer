/** Client-only display preferences (no backend). */

const KEY = "gd-ui-prefs";

export type FontScale = "sm" | "md" | "lg";
export type LibraryCardSize = "none" | "sm" | "md" | "lg";

export type LibraryViewMode = "grid" | "list";

export type ColorScheme = "light" | "dark";

export type UiPreferences = {
  fontScale: FontScale;
  libraryCardSize: LibraryCardSize;
  /** My library asset list layout */
  libraryViewMode: LibraryViewMode;
  colorScheme: ColorScheme;
};

const defaults: UiPreferences = {
  fontScale: "md",
  libraryCardSize: "md",
  libraryViewMode: "grid",
  colorScheme: "dark",
};

function parse(raw: string | null): UiPreferences {
  if (!raw) return { ...defaults };
  try {
    const j = JSON.parse(raw) as Partial<UiPreferences>;
    return {
      fontScale: j.fontScale === "sm" || j.fontScale === "lg" ? j.fontScale : defaults.fontScale,
      libraryCardSize:
        j.libraryCardSize === "none" ||
        j.libraryCardSize === "sm" ||
        j.libraryCardSize === "md" ||
        j.libraryCardSize === "lg"
          ? j.libraryCardSize
          : defaults.libraryCardSize,
      libraryViewMode:
        j.libraryViewMode === "list" || j.libraryViewMode === "grid"
          ? j.libraryViewMode
          : defaults.libraryViewMode,
      colorScheme: j.colorScheme === "light" || j.colorScheme === "dark" ? j.colorScheme : defaults.colorScheme,
    };
  } catch {
    return { ...defaults };
  }
}

export function readUiPreferences(): UiPreferences {
  if (typeof window === "undefined") return { ...defaults };
  return parse(localStorage.getItem(KEY));
}

export function writeUiPreferences(p: Partial<UiPreferences>, base?: UiPreferences): UiPreferences {
  const next: UiPreferences = { ...(base ?? readUiPreferences()), ...p };
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(next));
  }
  return next;
}

export function applyUiPreferencesToDocument(p: UiPreferences) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.setAttribute("data-gd-font", p.fontScale);
  el.setAttribute("data-gd-card", p.libraryCardSize);
  el.setAttribute("data-gd-theme", p.colorScheme);
}

export { defaults as defaultUiPreferences };
