/**
 * Packaging profiles and courier rate cards. All figures are placeholders until negotiated rate
 * cards and logger-validated packaging trials replace them.
 */
export const PACKAGING_SEED = [
  {
    code: "AMBIENT_BOX",
    name: "Rigid gift carton",
    tempClass: "AMBIENT" as const,
    coolant: "NONE" as const,
    maxHoldHours: 720,
    isDangerousGoods: false,
    outerLengthMm: 250,
    outerBreadthMm: 200,
    outerHeightMm: 120,
    tareWeightG: 250,
    maxPayloadG: 5000,
    costPaise: 4000,
    isActive: true,
  },
  {
    code: "PCM_CHILL_24",
    name: "Insulated box with gel packs (24 h)",
    tempClass: "CHILLED" as const,
    coolant: "GEL_PCM" as const,
    maxHoldHours: 30,
    isDangerousGoods: false,
    outerLengthMm: 280,
    outerBreadthMm: 220,
    outerHeightMm: 180,
    tareWeightG: 700,
    maxPayloadG: 2500,
    costPaise: 18000,
    isActive: true,
  },
  {
    code: "PCM_CHILL_48",
    name: "Insulated box with gel packs (48 h)",
    tempClass: "CHILLED" as const,
    coolant: "GEL_PCM" as const,
    maxHoldHours: 54,
    isDangerousGoods: false,
    outerLengthMm: 320,
    outerBreadthMm: 260,
    outerHeightMm: 220,
    tareWeightG: 1300,
    maxPayloadG: 3500,
    costPaise: 29000,
    isActive: true,
  },
  {
    // Phase 3 (frozen & cooked meals). Kept for completeness, inactive at launch.
    code: "DRY_ICE_FROZEN",
    name: "Insulated box with dry ice",
    tempClass: "FROZEN" as const,
    coolant: "DRY_ICE" as const,
    maxHoldHours: 60,
    isDangerousGoods: true,
    outerLengthMm: 350,
    outerBreadthMm: 300,
    outerHeightMm: 250,
    tareWeightG: 2500,
    maxPayloadG: 4000,
    costPaise: 45000,
    isActive: false,
  },
];

const rate = (
  carrierCode: string,
  mode: "AIR_EXPRESS" | "SURFACE_EXPRESS",
  zone: string,
  firstRupees: number,
  addlRupees: number,
  fuelBps: number,
  odaRupees: number,
) => ({
  carrierCode,
  mode,
  zone,
  volumetricDivisor: 5000,
  firstSlabG: 500,
  firstSlabPaise: firstRupees * 100,
  addlSlabG: 500,
  addlSlabPaise: addlRupees * 100,
  fuelSurchargeBps: fuelBps,
  odaSurchargePaise: odaRupees * 100,
});

export const RATE_CARD_SEED = [
  rate("bluedart", "AIR_EXPRESS", "NEAR", 95, 75, 2500, 100),
  rate("bluedart", "AIR_EXPRESS", "METRO", 110, 90, 2500, 100),
  rate("delhivery", "SURFACE_EXPRESS", "NEAR", 45, 30, 1500, 60),
  rate("delhivery", "SURFACE_EXPRESS", "METRO", 55, 40, 1500, 60),
];

export const CARRIERS = ["bluedart", "delhivery"] as const;
