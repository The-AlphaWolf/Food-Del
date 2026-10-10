import { colors, darkColors, darkShadow, fonts, radius, shadow } from "./index";

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function nightVariables(indent: string): string[] {
  return [
    ...Object.entries(darkColors).map(([k, v]) => `${indent}--color-${kebab(k)}: ${v};`),
    ...Object.entries(darkShadow).map(([k, v]) => `${indent}--shadow-${k}: ${v};`),
  ];
}

/**
 * Tailwind v4 theme block (`bg-paper`, `text-ink`, `font-display`, `rounded-lg`, `shadow-card`…)
 * plus the Night theme, which swaps the same variables. `data-theme` on <html> is set before
 * first paint (see apps/web/src/lib/theme.ts); without JavaScript the system setting decides.
 */
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
  lines.push(":root {", "  color-scheme: light;", "}", "");
  lines.push(
    ':root[data-theme="dark"] {',
    "  color-scheme: dark;",
    ...nightVariables("  "),
    "}",
    "",
  );
  lines.push(
    "@media (prefers-color-scheme: dark) {",
    "  :root:not([data-theme]) {",
    "    color-scheme: dark;",
    ...nightVariables("    "),
    "  }",
    "}",
    "",
  );
  return lines.join("\n");
}
