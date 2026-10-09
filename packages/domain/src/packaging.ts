import type { TempClass } from "./catalog";
import type { Paise } from "./money";

export const COOLANTS = ["NONE", "GEL_PCM", "DRY_ICE"] as const;
export type Coolant = (typeof COOLANTS)[number];

/**
 * A validated box + coolant combination. `maxHoldHours` must come from logger-validated lane
 * trials at summer peak ambient (≈40 °C), never from the supplier's brochure.
 */
export interface PackagingProfile {
  code: string;
  name: string;
  tempClass: TempClass;
  coolant: Coolant;
  maxHoldHours: number;
  /** Dry ice is IATA dangerous goods (UN1845); not every carrier accepts it. */
  isDangerousGoods: boolean;
  /** Outer dimensions in millimetres: length, breadth, height. */
  outerDimsMm: readonly [number, number, number];
  tareWeightG: number;
  maxPayloadG: number;
  costPaise: Paise;
}

/** Volumetric weight in grams: L×B×H (cm) ÷ divisor, expressed in kg → g, rounded up. */
export function volumetricWeightG(
  dimsMm: readonly [number, number, number],
  divisor: number,
): number {
  const [l, b, h] = dimsMm;
  const cubicCm = (l / 10) * (b / 10) * (h / 10);
  return Math.ceil((cubicCm / divisor) * 1000);
}

/** Couriers bill whichever is greater: dead weight or volumetric weight. */
export function chargeableWeightG(
  deadWeightG: number,
  dimsMm: readonly [number, number, number],
  divisor: number,
): number {
  return Math.max(deadWeightG, volumetricWeightG(dimsMm, divisor));
}
