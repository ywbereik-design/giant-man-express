export type ThemeMode = "dark" | "light";

// Dark mode — the app's original (and, for the Admin/Dispatch/Accountant
// screens, still-only) look. Named colors kept identical in shape to the
// light palette below so every consumer can swap one for the other without
// caring which mode is active.
export const darkColors = {
  background: "#121212",
  surface: "#1e1e1e",
  surfaceAlt: "#262626",
  border: "#333333",
  primary: "#FFCC00",
  primaryText: "#151515",
  text: "#f4f4f5",
  textMuted: "#9aa0ab",
  danger: "#e5484d",
  success: "#3fb950",
  info: "#4a9eff",
};

// Light mode — deliberately not using solid red as `primary`, so a primary
// action button is never visually confusable with an error/cancellation
// (which still uses `danger`, a distinct red, only for that purpose).
export const lightColors = {
  background: "#F8F9FA",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F3F5",
  border: "#E2E8F0",
  primary: "#1E293B",
  primaryText: "#FFFFFF",
  text: "#0F172A",
  textMuted: "#64748B",
  danger: "#DC2626",
  success: "#16A34A",
  info: "#2563EB",
};

export type ThemeColors = typeof darkColors;

// Static, non-reactive palette — kept for screens that haven't been wired
// up to useTheme() (see ThemeContext.tsx). Only the Driver app currently
// exposes a light/dark toggle; every other role keeps this exact dark look.
export const colors = darkColors;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
