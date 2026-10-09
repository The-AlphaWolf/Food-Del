import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderThemeCss } from "./css";
import { colors } from "./index";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
};

describe("design tokens", () => {
  it("keeps the generated CSS in sync", () => {
    const file = readFileSync(fileURLToPath(new URL("./theme.css", import.meta.url)), "utf8");
    expect(file).toBe(renderThemeCss());
  });

  it.each([
    ["ink", "paper"],
    ["inkSoft", "paper"],
    ["inkMuted", "card"],
    ["onJaggery", "jaggery"],
    ["onSaffron", "saffron"],
    ["chilled", "chilledSoft"],
    ["veg", "card"],
    ["danger", "dangerSoft"],
    ["warning", "warningSoft"],
    ["success", "successSoft"],
    ["info", "infoSoft"],
    ["jaggery", "paper"],
  ] as const)("%s on %s meets WCAG AA", (fg, bg) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
