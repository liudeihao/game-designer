export type ThemeId = "dark" | "light";

const STORAGE_KEY = "gd.theme";
const DEFAULT_THEME: ThemeId = "dark";

export function loadTheme(): ThemeId {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "dark" || raw === "light") return raw;
  return DEFAULT_THEME;
}

export function saveTheme(theme: ThemeId) {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function setTheme(theme: ThemeId) {
  saveTheme(theme);
  applyTheme(theme);
}

export function toggleTheme(): ThemeId {
  const next: ThemeId = loadTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
