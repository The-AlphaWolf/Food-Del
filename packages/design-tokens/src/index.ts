/**
 * Food-Del brand tokens — the single source for web (Tailwind v4 @theme, generated) and mobile
 * (NativeWind / StyleSheet). Warm, editorial, unhurried: cream paper, jaggery brown, a touch of
 * saffron. Semantic colours carry meaning shoppers rely on (cold chain, FSSAI diet marks), so they
 * are never decorative.
 *
 * Contrast: every *foreground on its background* pair here meets WCAG AA (4.5:1) for body text.
 */
export const colors = {
  // Surfaces
  paper: "#FFF9F0",
  paperDeep: "#F7EBDA",
  card: "#FFFFFF",
  ink: "#2A1609",
  inkSoft: "#5B4636",
  inkMuted: "#7A6453",
  line: "#E8D8C3",
  lineStrong: "#D4BFA4",
  /** Borders that identify a control (inputs, checkboxes): 3:1 against the surface. */
  field: "#A08770",

  // Brand
  jaggery: "#8A3B0C",
  jaggeryDeep: "#6B2D08",
  onJaggery: "#FFFFFF",
  saffron: "#E39A2B",
  saffronSoft: "#FCEBCF",
  onSaffron: "#2A1609",
  rose: "#B23A48",

  // Semantic
  chilled: "#0F6E80",
  chilledSoft: "#E1F2F4",
  ambient: "#8A5A17",
  ambientSoft: "#F7ECD9",
  veg: "#1B7A3A",
  nonVeg: "#8B2A1A",
  egg: "#B7791F",
  success: "#1B7A3A",
  successSoft: "#E3F3E8",
  warning: "#9A5B00",
  warningSoft: "#FFF1D6",
  danger: "#B42318",
  dangerSoft: "#FDE8E6",
  info: "#2F4A9E",
  infoSoft: "#E7ECFB",
  focus: "#1D4ED8",

  // Illustration backdrops (behind the drawn delicacies), by how the item travels
  artAmbientA: "#F6E3C5",
  artAmbientB: "#EBC98F",
  artChilledA: "#E3F1F2",
  artChilledB: "#BFE0E3",
  artFrozenA: "#E8EEF8",
  artFrozenB: "#C7D5EE",
} as const;

/**
 * "Night": the same shop after dark. Designed alongside the light theme, not inverted: warm
 * near-black surfaces (never pure black), lighter tonal versions of the brand colours, and dark
 * text on the primary button. Every pair checked for light is checked again here.
 */
export const darkColors: Record<ColorToken, string> = {
  paper: "#16100B",
  paperDeep: "#1E1610",
  card: "#251C15",
  ink: "#F7ECDF",
  inkSoft: "#DCC8B3",
  inkMuted: "#B9A28C",
  line: "#3B2D22",
  lineStrong: "#5A4535",
  field: "#86705C",

  jaggery: "#E9A46B",
  jaggeryDeep: "#F3BC8C",
  onJaggery: "#1B0F07",
  saffron: "#F2B552",
  saffronSoft: "#3E2B12",
  onSaffron: "#1B0F07",
  rose: "#EE8F9B",

  chilled: "#6FCBDA",
  chilledSoft: "#10343C",
  ambient: "#E6B06A",
  ambientSoft: "#3A2915",
  veg: "#5BCB86",
  nonVeg: "#EE8771",
  egg: "#E8B55C",
  success: "#6BD394",
  successSoft: "#133523",
  warning: "#F3BE5C",
  warningSoft: "#3B2C10",
  danger: "#F7978C",
  dangerSoft: "#401A16",
  info: "#A3B6F5",
  infoSoft: "#1D2645",
  focus: "#93B8FF",

  artAmbientA: "#3A2918",
  artAmbientB: "#5B3F22",
  artChilledA: "#173A40",
  artChilledB: "#22545C",
  artFrozenA: "#1D2742",
  artFrozenB: "#2D3B63",
};

export const fonts = {
  display: '"Playfair Display Variable", "Playfair Display", Georgia, "Times New Roman", serif',
  body: '"Karla Variable", "Karla", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif',
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

/** 4-px base scale. */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

export const radius = { sm: 6, md: 10, lg: 16, xl: 24, pill: 999 } as const;

export const shadow = {
  card: "0 1px 2px rgba(42, 22, 9, 0.06), 0 4px 16px rgba(42, 22, 9, 0.06)",
  lift: "0 2px 4px rgba(42, 22, 9, 0.08), 0 12px 32px rgba(42, 22, 9, 0.12)",
} as const;

/** On dark surfaces shadows need more weight to read as elevation. */
export const darkShadow: Record<keyof typeof shadow, string> = {
  card: "0 1px 2px rgba(0, 0, 0, 0.45), 0 4px 16px rgba(0, 0, 0, 0.35)",
  lift: "0 2px 4px rgba(0, 0, 0, 0.5), 0 12px 32px rgba(0, 0, 0, 0.5)",
};

export const themes = ["light", "dark"] as const;
export type Theme = (typeof themes)[number];

/** Durations in ms. Exits are faster than entrances; everything respects reduced motion. */
export const motion = { fast: 150, base: 220, slow: 320 } as const;

/** Background motifs for illustrated product art, keyed by temperature class. */
export const artPalettes = {
  AMBIENT: ["#F6E3C5", "#EBC98F", "#8A3B0C"],
  CHILLED: ["#E3F1F2", "#BFE0E3", "#0F6E80"],
  FROZEN: ["#E8EEF8", "#C7D5EE", "#2F4A9E"],
} as const;

export type ColorToken = keyof typeof colors;
