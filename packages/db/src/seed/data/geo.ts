/**
 * Launch geography (confirmed decision #2): four origin cities, seven destination metros.
 *
 * Pincode ranges are a development stand-in for the India Post directory: most codes in these
 * ranges are real delivery pincodes, a few are not. Production imports the full directory with
 * `pnpm --filter @food-del/db run import:pincodes`.
 */
export interface CitySeed {
  slug: string;
  name: string;
  stateCode: string;
  airportIata: string;
  isOrigin: boolean;
  tagline: string;
  sortOrder: number;
  pincodeRanges: { from: number; to: number; district: string; stateCode?: string }[];
}

export const CITY_SEED: CitySeed[] = [
  {
    slug: "kolkata",
    name: "Kolkata",
    stateCode: "WB",
    airportIata: "CCU",
    isOrigin: true,
    tagline: "Mishti made the old way, in north Kolkata's sweet lanes",
    sortOrder: 1,
    pincodeRanges: [{ from: 700001, to: 700160, district: "Kolkata" }],
  },
  {
    slug: "hyderabad",
    name: "Hyderabad",
    stateCode: "TG",
    airportIata: "HYD",
    isOrigin: true,
    tagline: "Irani bakeries and the Nizam's own desserts",
    sortOrder: 2,
    pincodeRanges: [{ from: 500001, to: 500098, district: "Hyderabad" }],
  },
  {
    slug: "delhi-ncr",
    name: "Delhi NCR",
    stateCode: "DL",
    airportIata: "DEL",
    isOrigin: true,
    tagline: "Old Delhi halwais, stirring the same kadhai for generations",
    sortOrder: 3,
    pincodeRanges: [
      { from: 110001, to: 110096, district: "Delhi" },
      { from: 122001, to: 122018, district: "Gurugram", stateCode: "HR" },
      { from: 201301, to: 201310, district: "Gautam Buddha Nagar", stateCode: "UP" },
    ],
  },
  {
    slug: "bengaluru",
    name: "Bengaluru",
    stateCode: "KA",
    airportIata: "BLR",
    isOrigin: true,
    tagline: "Ghee-rich sweets and snacks of old Mysore country",
    sortOrder: 4,
    pincodeRanges: [{ from: 560001, to: 560100, district: "Bengaluru Urban" }],
  },
  {
    slug: "mumbai",
    name: "Mumbai",
    stateCode: "MH",
    airportIata: "BOM",
    isOrigin: false,
    tagline: "Coming soon as an origin",
    sortOrder: 5,
    pincodeRanges: [{ from: 400001, to: 400104, district: "Mumbai" }],
  },
  {
    slug: "chennai",
    name: "Chennai",
    stateCode: "TN",
    airportIata: "MAA",
    isOrigin: false,
    tagline: "Coming soon as an origin",
    sortOrder: 6,
    pincodeRanges: [{ from: 600001, to: 600123, district: "Chennai" }],
  },
  {
    slug: "pune",
    name: "Pune",
    stateCode: "MH",
    airportIata: "PNQ",
    isOrigin: false,
    tagline: "Coming soon as an origin",
    sortOrder: 7,
    pincodeRanges: [{ from: 411001, to: 411062, district: "Pune" }],
  },
];

/** Real pincodes outside the launch footprint, so "we don't deliver here yet" is testable. */
export const UNLAUNCHED_PINCODES = [
  { pincode: "302001", district: "Jaipur", stateCode: "RJ" },
  { pincode: "226001", district: "Lucknow", stateCode: "UP" },
  { pincode: "380001", district: "Ahmedabad", stateCode: "GJ" },
  { pincode: "741101", district: "Nadia", stateCode: "WB" },
];

/** Approximate road distance (km) between launch cities, used to class surface lanes. */
const ROAD_KM: Record<string, number> = {
  "kolkata|delhi-ncr": 1500,
  "kolkata|mumbai": 1900,
  "kolkata|bengaluru": 1900,
  "kolkata|chennai": 1700,
  "kolkata|hyderabad": 1500,
  "kolkata|pune": 1900,
  "hyderabad|delhi-ncr": 1550,
  "hyderabad|mumbai": 710,
  "hyderabad|bengaluru": 570,
  "hyderabad|chennai": 630,
  "hyderabad|pune": 560,
  "delhi-ncr|mumbai": 1400,
  "delhi-ncr|bengaluru": 2150,
  "delhi-ncr|chennai": 2200,
  "delhi-ncr|pune": 1450,
  "bengaluru|mumbai": 980,
  "bengaluru|chennai": 350,
  "bengaluru|pune": 840,
};

export function roadKm(a: string, b: string): number {
  const km = ROAD_KM[`${a}|${b}`] ?? ROAD_KM[`${b}|${a}`];
  if (km === undefined) throw new Error(`No distance for ${a} ↔ ${b}`);
  return km;
}

export interface LaneTemplate {
  carrierCode: string;
  mode: "AIR_EXPRESS" | "SURFACE_EXPRESS";
  transitHoursP50: number;
  transitHoursP90: number;
  pickupCutoffLocal: string;
  rateZone: "NEAR" | "METRO";
}

/**
 * Placeholder transit times until carrier feeds and our own delivered-shipment data replace them
 * (lanes are marked `MANUAL`). Air is next-day metro to metro; Pune adds a few hours.
 */
export function laneTemplates(origin: string, dest: string): LaneTemplate[] {
  const km = roadKm(origin, dest);
  const zone = km < 700 ? "NEAR" : "METRO";
  const smallerAirport = dest === "pune" || origin === "pune";
  const air: LaneTemplate = {
    carrierCode: "bluedart",
    mode: "AIR_EXPRESS",
    transitHoursP50: smallerAirport ? 30 : 24,
    transitHoursP90: smallerAirport ? 44 : 36,
    pickupCutoffLocal: "16:00",
    rateZone: zone,
  };
  const surface: LaneTemplate = {
    carrierCode: "delhivery",
    mode: "SURFACE_EXPRESS",
    transitHoursP50: km < 700 ? 36 : km < 1300 ? 72 : 96,
    transitHoursP90: km < 700 ? 60 : km < 1300 ? 108 : 144,
    pickupCutoffLocal: "17:00",
    rateZone: zone,
  };
  return [air, surface];
}

/** Fixed-date national holidays: no dispatch, no courier movement. */
export const NATIONAL_HOLIDAYS = [
  { date: "2026-10-02", reason: "Gandhi Jayanti" },
  { date: "2026-11-08", reason: "Diwali (Lakshmi Puja)" },
  { date: "2026-12-25", reason: "Christmas" },
  { date: "2027-01-26", reason: "Republic Day" },
  { date: "2027-08-15", reason: "Independence Day" },
];
