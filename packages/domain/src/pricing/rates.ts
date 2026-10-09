import { applyBps, ceilToRupee, type Paise } from "../money";

export const SHIP_MODES = ["AIR_EXPRESS", "SURFACE_EXPRESS"] as const;
export type ShipMode = (typeof SHIP_MODES)[number];

export const SHIP_MODE_LABELS: Record<ShipMode, string> = {
  AIR_EXPRESS: "Air express",
  SURFACE_EXPRESS: "Surface express",
};

/**
 * A courier's slab tariff for one service in one zone: a first slab (usually 500 g) plus
 * additional slabs, a fuel surcharge on the freight and a flat surcharge for out-of-delivery-area
 * (ODA) pincodes.
 */
export interface RateCard {
  carrierCode: string;
  mode: ShipMode;
  zone: string;
  volumetricDivisor: number;
  firstSlabG: number;
  firstSlabPaise: Paise;
  addlSlabG: number;
  addlSlabPaise: Paise;
  fuelSurchargeBps: number;
  odaSurchargePaise: Paise;
}

/** What the courier charges us for a parcel of `chargeableG` grams. */
export function freightCostPaise(rate: RateCard, chargeableG: number, isOda: boolean): Paise {
  const extraSlabs =
    chargeableG <= rate.firstSlabG
      ? 0
      : Math.ceil((chargeableG - rate.firstSlabG) / rate.addlSlabG);
  const freight = rate.firstSlabPaise + extraSlabs * rate.addlSlabPaise;
  return freight + applyBps(freight, rate.fuelSurchargeBps) + (isOda ? rate.odaSurchargePaise : 0);
}

/**
 * How carrier and packaging costs become customer-facing fees. Kept as data so marketing can run
 * subsidies (e.g. a festive shipping offer) without code changes.
 */
export interface FeePolicy {
  /** Markup applied to freight cost (e.g. 1000 = +10% for payment fees and claims reserve). */
  shippingMarkupBps: number;
  packagingMarkupBps: number;
  /** Shipments whose item value reaches this threshold get `shippingSubsidyPaise` off. */
  subsidyThresholdPaise: Paise | null;
  shippingSubsidyPaise: Paise;
}

export const DEFAULT_FEE_POLICY: FeePolicy = {
  shippingMarkupBps: 1000,
  packagingMarkupBps: 0,
  subsidyThresholdPaise: null,
  shippingSubsidyPaise: 0,
};

export function customerShippingFee(costPaise: Paise, policy: FeePolicy): Paise {
  return ceilToRupee(costPaise + applyBps(costPaise, policy.shippingMarkupBps));
}

export function customerPackagingFee(costPaise: Paise, policy: FeePolicy): Paise {
  return ceilToRupee(costPaise + applyBps(costPaise, policy.packagingMarkupBps));
}

/** Subsidy for a shipment of the given item value; never more than the fee itself. */
export function shippingSubsidy(itemValuePaise: Paise, feePaise: Paise, policy: FeePolicy): Paise {
  if (policy.subsidyThresholdPaise == null || itemValuePaise < policy.subsidyThresholdPaise)
    return 0;
  return Math.min(policy.shippingSubsidyPaise, feePaise);
}
