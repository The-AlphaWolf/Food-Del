import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderThemeCss } from "./css";
import { type ColorToken, colors, darkColors } from "./index";

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

/** Text pairs the UI actually uses; each must reach 4.5:1 in both themes. */
const TEXT_PAIRS: [ColorToken, ColorToken][] = [
  ["ink", "paper"],
  ["ink", "card"],
  ["ink", "paperDeep"],
  ["inkSoft", "paper"],
  ["inkSoft", "card"],
  ["inkMuted", "card"],
  ["inkMuted", "paper"],
  ["inkMuted", "paperDeep"],
  ["onJaggery", "jaggery"],
  ["onJaggery", "jaggeryDeep"],
  ["onSaffron", "saffron"],
  ["jaggery", "paper"],
  ["jaggery", "card"],
  ["jaggery", "saffronSoft"],
  ["ink", "saffronSoft"],
  ["chilled", "chilledSoft"],
  ["chilled", "card"],
  ["ambient", "ambientSoft"],
  ["veg", "card"],
  ["nonVeg", "card"],
  ["success", "successSoft"],
  ["success", "card"],
  ["warning", "warningSoft"],
  ["danger", "dangerSoft"],
  ["danger", "card"],
  ["info", "infoSoft"],
];

/** Non-text UI (focus rings, the egg diet mark) needs 3:1 against what it sits on. */
const UI_PAIRS: [ColorToken, ColorToken][] = [
  ["focus", "paper"],
  ["focus", "card"],
  ["egg", "card"],
  ["field", "card"],
  ["field", "paper"],
];

describe("design tokens", () => {
  it("keeps the generated CSS in sync", () => {
    const file = readFileSync(fileURLToPath(new URL("./theme.css", import.meta.url)), "utf8");
    expect(file).toBe(renderThemeCss());
  });

  it("defines every colour in both themes", () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(colors).sort());
  });

  for (const [theme, palette] of [
    ["light", colors],
    ["dark", darkColors],
  ] as const) {
    it.each(TEXT_PAIRS)(`${theme}: %s on %s meets WCAG AA for text`, (fg, bg) => {
      expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(4.5);
    });
    it.each(UI_PAIRS)(`${theme}: %s on %s meets 3:1 for UI`, (fg, bg) => {
      expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(3);
    });
  }
});
