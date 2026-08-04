import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { darkColors, lightColors, ThemeColors, ThemeMode } from "./theme";

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "gme_theme_mode";

// Currently only the Driver app exposes a way to actually change this (see
// DriverTopTabBar) — every other role never renders that control, so they
// stay on the default "dark" mode below, matching the app's original look.
// The provider still wraps the whole app (not just the Driver navigator)
// because the shared ui.tsx primitives (Card, Button, etc.) need a
// ThemeContext ancestor to render at all.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (stored === "light" || stored === "dark") setModeState(stored);
      } catch {
        // SecureStore is unavailable in some environments (e.g. Expo web preview) — default to dark.
      }
    })();
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {
      // best-effort — a failed persist just means it reverts to dark next launch.
    });
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {
        // best-effort — a failed persist just means it reverts to dark next launch.
      });
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ mode, colors: mode === "dark" ? darkColors : lightColors, setMode, toggle }),
    [mode, setMode, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
