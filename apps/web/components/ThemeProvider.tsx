"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { THEME_COOKIE } from "@/lib/session";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: "light", toggle: () => undefined });

/** The root layout reads the theme cookie and renders `data-theme` on the server, so there is no flash. */
export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
