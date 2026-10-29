"use client";

import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const label = `Switch to ${isDark ? "light" : "dark"} theme`;
  return (
    <button type="button" onClick={toggle} className="theme-btn" aria-label={label} title={label}>
      <span aria-hidden="true">{isDark ? "\u263E" : "\u2600"}</span>
    </button>
  );
}
