import { colors, fonts, radius, shadow } from "./index";

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** Tailwind v4 theme block: `bg-paper`, `text-ink`, `font-display`, `rounded-lg`, `shadow-card`… */
export function renderThemeCss(): string {
  const lines = [
    "/* Generated from src/index.ts by `pnpm --filter @food-del/design-tokens build:css`. Do not edit. */",
    "@theme {",
  ];
  for (const [k, v] of Object.entries(colors)) lines.push(`  --color-${kebab(k)}: ${v};`);
  lines.push(`  --font-display: ${fonts.display};`);
  lines.push(`  --font-sans: ${fonts.body};`);
  lines.push(`  --font-mono: ${fonts.mono};`);
  for (const [k, v] of Object.entries(radius)) lines.push(`  --radius-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(shadow)) lines.push(`  --shadow-${k}: ${v};`);
  lines.push("}", "");
  return lines.join("\n");
}
