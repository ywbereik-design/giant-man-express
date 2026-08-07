import { describe, it, expect } from "vitest";
import { darkColors, lightColors } from "../src/theme/theme";

// Standard WCAG relative-luminance / contrast-ratio formulas — independent
// implementation (not copy-pasted from anywhere in src/) so this test can't
// just reflect a shared bug back at itself.
function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linearize = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [lr, lg, lb] = [r, g, b].map(linearize);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrastRatio(hexA: string, hexB: string): number {
  const [l1, l2] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

const WHITE = "#FFFFFF";
const AA_NORMAL_TEXT_MIN = 4.5;

// Badge (ui.tsx) always renders white text regardless of tone or theme —
// every fill color it can use must clear the WCAG AA minimum against white.
describe("Badge tone colors vs. hardcoded white text (WCAG AA)", () => {
  it.each([
    ["dark", "info", darkColors.info],
    ["dark", "success", darkColors.success],
    ["dark", "danger", darkColors.danger],
    ["light", "info", lightColors.info],
    ["light", "success", lightColors.success],
    ["light", "danger", lightColors.danger],
  ])("%s mode's %s passes 4.5:1 against white", (_mode, _tone, hex) => {
    expect(contrastRatio(hex, WHITE)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_MIN);
  });
});
