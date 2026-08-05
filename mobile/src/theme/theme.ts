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
  // Fill behind a "muted"-tone Badge (see ui.tsx) — kept distinct from
  // `border` even though it's the same value here, because light mode
  // needs a genuinely different (much darker) fill for its white badge
  // text to stay legible; `border` itself stays a plain divider color.
  mutedBadgeBg: "#333333",
};

// Light mode — deliberately not using solid red as `primary`, so a primary
// action button is never visually confusable with an error/cancellation
// (which still uses `danger`, a distinct red, only for that purpose).
// Every value below was picked (and checked against WCAG contrast ratios)
// to read cleanly against `background`/`surface`, not just to look right —
// `textMuted` and `success` in particular were lightened/darkened from an
// earlier pass that technically passed but only barely (~4.5:1).
export const lightColors = {
  background: "#F8F9FA",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F3F5",
  border: "#E2E8F0",
  primary: "#1E293B",
  primaryText: "#FFFFFF",
  text: "#0F172A",
  // Slate-600, not slate-500 — ~7.5:1 against background/surface instead of
  // a borderline ~4.5:1, so secondary/hint text stays comfortably readable.
  textMuted: "#475569",
  danger: "#DC2626",
  // Green-700, not green-600 — plain green-600 (#16A34A) only hits ~3.3:1
  // with the white text Badge always uses, well under the 4.5:1 AA minimum.
  success: "#15803D",
  info: "#2563EB",
  // A "muted" Badge previously filled with `border` (#E2E8F0, near-white)
  // behind hardcoded white text — effectively invisible. This is a
  // distinct, deliberately dark fill so that pairing stays legible.
  mutedBadgeBg: "#475569",
};

export type ThemeColors = typeof darkColors;

// Static, non-reactive palette — kept for screens that haven't been wired
// up to useTheme() (see ThemeContext.tsx). Only the Driver app currently
// exposes a light/dark toggle; every other role keeps this exact dark look.
export const colors = darkColors;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
