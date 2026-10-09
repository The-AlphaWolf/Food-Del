/**
 * Catalogue vocabulary: temperature classes, diet marks and the freshness profile that drives
 * every serviceability decision.
 */

export const TEMP_CLASSES = ["AMBIENT", "CHILLED", "FROZEN"] as const;
export type TempClass = (typeof TEMP_CLASSES)[number];

const TEMP_RANK: Record<TempClass, number> = { AMBIENT: 0, CHILLED: 1, FROZEN: 2 };

export function tempRank(t: TempClass): number {
  return TEMP_RANK[t];
}

/** The most demanding temperature class among the given items. */
export function strictestTemp(classes: Iterable<TempClass>): TempClass {
  let strictest: TempClass = "AMBIENT";
  for (const c of classes) if (TEMP_RANK[c] > TEMP_RANK[strictest]) strictest = c;
  return strictest;
}

/**
 * Whether packaging built for `packagingTemp` may carry items that need `requiredTemp`.
 * Ambient goods ride happily in a chilled box, but nothing non-frozen goes on dry ice (milk
 * sweets would freeze) and nothing chilled goes in a plain carton.
 */
export function isPackagingCompatible(packagingTemp: TempClass, requiredTemp: TempClass): boolean {
  if (packagingTemp === requiredTemp) return true;
  return requiredTemp === "AMBIENT" && packagingTemp === "CHILLED";
}

/** Whether two items may share one box. */
export function canShareBox(a: TempClass, b: TempClass): boolean {
  return (a === "FROZEN") === (b === "FROZEN");
}

export const TEMP_LABELS: Record<TempClass, string> = {
  AMBIENT: "Room temperature",
  CHILLED: "Chilled (0–8 °C)",
  FROZEN: "Frozen (≤ −18 °C)",
};

export const DIETS = ["VEG", "EGG", "NON_VEG"] as const;
export type Diet = (typeof DIETS)[number];

export const DIET_LABELS: Record<Diet, string> = {
  VEG: "Vegetarian",
  EGG: "Contains egg",
  NON_VEG: "Non-vegetarian",
};

/**
 * Everything the planner needs to know about how long an item stays good.
 *
 * - `shelfLifeHours` is measured from preparation while held at `tempClass`.
 * - `minResidualHours` is how much life must remain when the parcel is handed to the customer.
 * - Stock items (`madeToOrder = false`) may already be `maxAgeAtDispatchHours` old at dispatch.
 */
export interface FreshnessProfile {
  tempClass: TempClass;
  shelfLifeHours: number;
  minResidualHours: number;
  madeToOrder: boolean;
  maxAgeAtDispatchHours: number | null;
}

/**
 * Policy floor for residual shelf life at delivery. FSSAI's e-commerce directions currently ask
 * for at least 30% of total shelf life to remain at delivery — confirm the exact wording with
 * counsel; the percentage is configuration, not code.
 */
export interface ResidualShelfLifePolicy {
  minResidualPct: number;
}

export const DEFAULT_RESIDUAL_POLICY: ResidualShelfLifePolicy = { minResidualPct: 30 };

export function minResidualFloorHours(
  shelfLifeHours: number,
  policy: ResidualShelfLifePolicy = DEFAULT_RESIDUAL_POLICY,
): number {
  return Math.ceil((shelfLifeHours * policy.minResidualPct) / 100);
}

/** Problems with a freshness profile, or an empty list when it is valid. */
export function validateFreshness(
  p: FreshnessProfile,
  policy: ResidualShelfLifePolicy = DEFAULT_RESIDUAL_POLICY,
): string[] {
  const issues: string[] = [];
  if (!Number.isInteger(p.shelfLifeHours) || p.shelfLifeHours <= 0) {
    issues.push("Shelf life must be a positive whole number of hours.");
  }
  if (p.minResidualHours >= p.shelfLifeHours) {
    issues.push("Minimum residual life must be shorter than the shelf life.");
  }
  if (p.minResidualHours < minResidualFloorHours(p.shelfLifeHours, policy)) {
    issues.push(
      `Minimum residual life must be at least ${policy.minResidualPct}% of shelf life (${minResidualFloorHours(p.shelfLifeHours, policy)} h).`,
    );
  }
  if (!p.madeToOrder && (p.maxAgeAtDispatchHours == null || p.maxAgeAtDispatchHours < 0)) {
    issues.push("Stock items need a maximum age at dispatch.");
  }
  if (
    !p.madeToOrder &&
    p.maxAgeAtDispatchHours != null &&
    p.maxAgeAtDispatchHours + p.minResidualHours >= p.shelfLifeHours
  ) {
    issues.push("Stock that old at dispatch could never reach a customer fresh.");
  }
  return issues;
}

/** "4 days", "36 hours", "6 months" — rounded down so we never overstate freshness. */
export function formatShelfLife(hours: number): string {
  if (hours < 48) return `${hours} hours`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days} days`;
  const months = Math.floor(days / 30);
  return `${months} months`;
}

/** "Stays fresh 4 days · Chilled" */
export function freshnessLabel(p: Pick<FreshnessProfile, "tempClass" | "shelfLifeHours">): string {
  const temp =
    p.tempClass === "AMBIENT" ? "Room temp" : p.tempClass === "CHILLED" ? "Chilled" : "Frozen";
  return `Stays fresh ${formatShelfLife(p.shelfLifeHours)} · ${temp}`;
}
