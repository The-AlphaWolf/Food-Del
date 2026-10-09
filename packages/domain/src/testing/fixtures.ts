/**
 * Realistic planning fixtures for tests, the calendar CLI and Storybook-style previews. Numbers are
 * plausible placeholders, not negotiated rates or validated packaging trials.
 */
import type { FreshnessProfile } from "../catalog";
import { rupees } from "../money";
import type { PackagingProfile } from "../packaging";
import { DEFAULT_FEE_POLICY, type RateCard } from "../pricing/rates";
import type {
  Lane,
  PlanningContext,
  PlanningPolicy,
  ShipmentLine,
  VendorSchedule,
} from "../serviceability/types";
import { atIst, type LocalDate, WEEKDAYS_MON_SAT } from "../time/ist";

/** Monday 12 October 2026, 11:00 IST. */
export const FIXTURE_NOW = atIst("2026-10-12", "11:00");

export const vendorSchedule = (overrides: Partial<VendorSchedule> = {}): VendorSchedule => ({
  id: "vendor-kolkata-1",
  orderCutoffLocal: "18:00",
  prepLeadDays: 1,
  prepStartLocal: "06:00",
  readyForPickupLocal: "12:00",
  dispatchWeekdays: WEEKDAYS_MON_SAT,
  dailyShipmentCap: 50,
  ...overrides,
});

export const AIR_LANE: Lane = {
  carrierCode: "bluedart",
  mode: "AIR_EXPRESS",
  transitHoursP50: 24,
  transitHoursP90: 36,
  pickupCutoffLocal: "16:00",
  deliversSunday: false,
  acceptsDryIce: false,
  rateZone: "METRO",
};

export const SURFACE_LANE: Lane = {
  carrierCode: "delhivery",
  mode: "SURFACE_EXPRESS",
  transitHoursP50: 72,
  transitHoursP90: 108,
  pickupCutoffLocal: "17:00",
  deliversSunday: false,
  acceptsDryIce: false,
  rateZone: "METRO",
};

export const PACKAGING: readonly PackagingProfile[] = [
  {
    code: "AMBIENT_BOX",
    name: "Rigid gift carton",
    tempClass: "AMBIENT",
    coolant: "NONE",
    maxHoldHours: 720,
    isDangerousGoods: false,
    outerDimsMm: [250, 200, 120],
    tareWeightG: 250,
    maxPayloadG: 5000,
    costPaise: rupees(40),
  },
  {
    code: "PCM_CHILL_24",
    name: "Insulated box + gel PCM (24 h)",
    tempClass: "CHILLED",
    coolant: "GEL_PCM",
    maxHoldHours: 30,
    isDangerousGoods: false,
    outerDimsMm: [280, 220, 180],
    tareWeightG: 700,
    maxPayloadG: 2500,
    costPaise: rupees(180),
  },
  {
    code: "PCM_CHILL_48",
    name: "Insulated box + gel PCM (48 h)",
    tempClass: "CHILLED",
    coolant: "GEL_PCM",
    maxHoldHours: 54,
    isDangerousGoods: false,
    outerDimsMm: [320, 260, 220],
    tareWeightG: 1300,
    maxPayloadG: 3500,
    costPaise: rupees(290),
  },
  {
    code: "DRY_ICE_FROZEN",
    name: "Insulated box + dry ice",
    tempClass: "FROZEN",
    coolant: "DRY_ICE",
    maxHoldHours: 60,
    isDangerousGoods: true,
    outerDimsMm: [350, 300, 250],
    tareWeightG: 2500,
    maxPayloadG: 4000,
    costPaise: rupees(450),
  },
];

export const RATE_CARDS: readonly RateCard[] = [
  {
    carrierCode: "bluedart",
    mode: "AIR_EXPRESS",
    zone: "METRO",
    volumetricDivisor: 5000,
    firstSlabG: 500,
    firstSlabPaise: rupees(110),
    addlSlabG: 500,
    addlSlabPaise: rupees(90),
    fuelSurchargeBps: 2500,
    odaSurchargePaise: rupees(100),
  },
  {
    carrierCode: "delhivery",
    mode: "SURFACE_EXPRESS",
    zone: "METRO",
    volumetricDivisor: 5000,
    firstSlabG: 500,
    firstSlabPaise: rupees(55),
    addlSlabG: 500,
    addlSlabPaise: rupees(40),
    fuelSurchargeBps: 1500,
    odaSurchargePaise: rupees(60),
  },
];

export const KAJU_KATLI: FreshnessProfile = {
  tempClass: "AMBIENT",
  shelfLifeHours: 240,
  minResidualHours: 72,
  madeToOrder: true,
  maxAgeAtDispatchHours: null,
};

export const NOLEN_GUR_SANDESH: FreshnessProfile = {
  tempClass: "CHILLED",
  shelfLifeHours: 72,
  minResidualHours: 22,
  madeToOrder: true,
  maxAgeAtDispatchHours: null,
};

export const CANNED_ROSOGOLLA: FreshnessProfile = {
  tempClass: "AMBIENT",
  shelfLifeHours: 4320,
  minResidualHours: 1296,
  madeToOrder: false,
  maxAgeAtDispatchHours: 720,
};

export const line = (
  freshness: FreshnessProfile,
  overrides: Partial<ShipmentLine> = {},
): ShipmentLine => ({
  variantId: `variant-${freshness.tempClass.toLowerCase()}-${freshness.shelfLifeHours}`,
  quantity: 1,
  unitPricePaise: rupees(650),
  gstRateBps: 500,
  unitPackedWeightG: 550,
  freshness,
  ...overrides,
});

export const DEFAULT_POLICY: PlanningPolicy = {
  horizonDays: 21,
  handlingBufferHours: 6,
  odaExtraHours: 24,
  fees: DEFAULT_FEE_POLICY,
};

export interface ContextOptions
  extends Partial<Omit<PlanningContext, "availableUnits" | "bookedShipments">> {
  stock?: number | ((variantId: string, date: LocalDate) => number);
  booked?: number | ((date: LocalDate) => number);
  dispatchBlackouts?: LocalDate[];
  carrierBlackouts?: Record<string, LocalDate[]>;
}

export function planningContext(opts: ContextOptions = {}): PlanningContext {
  const { stock = 20, booked = 0, dispatchBlackouts = [], carrierBlackouts = {}, ...rest } = opts;
  return {
    now: FIXTURE_NOW,
    vendor: vendorSchedule(),
    destination: { pincode: "560001", isOda: false },
    lines: [line(KAJU_KATLI)],
    lanes: [AIR_LANE, SURFACE_LANE],
    packaging: PACKAGING,
    rateCards: RATE_CARDS,
    blackouts: {
      dispatch: new Set(dispatchBlackouts),
      carrier: new Map(Object.entries(carrierBlackouts).map(([k, v]) => [k, new Set(v)])),
    },
    policy: DEFAULT_POLICY,
    availableUnits: typeof stock === "number" ? () => stock : stock,
    bookedShipments: typeof booked === "number" ? () => booked : booked,
    ...rest,
  };
}
