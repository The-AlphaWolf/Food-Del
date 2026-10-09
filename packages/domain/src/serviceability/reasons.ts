/**
 * Why a shipment cannot be planned.
 *
 * Candidate checks run from structural to transient, and the order of `CANDIDATE_REASONS` is that
 * evaluation order: a candidate that fails at `SOLD_OUT` passed every structural, calendar and
 * cutoff check, so it is the most informative thing to tell the customer. When several candidates
 * fail, the one that got furthest wins.
 */
export const CANDIDATE_REASONS = [
  "PICKUP_CUTOFF_MISSED",
  "NO_RATE_CARD",
  "SHELF_LIFE_EXCEEDED",
  "NO_COMPATIBLE_PACKAGING",
  "EXCEEDS_BOX_PAYLOAD",
  "DRY_ICE_NOT_ACCEPTED",
  "PACKAGING_HOLD_EXCEEDED",
  "VENDOR_CLOSED",
  "CARRIER_CLOSED",
  "CUTOFF_PASSED",
  "VENDOR_AT_CAPACITY",
  "SOLD_OUT",
] as const;
export type CandidateReason = (typeof CANDIDATE_REASONS)[number];

/** Reasons that apply to a whole request rather than one candidate. */
export const REQUEST_REASONS = [
  "INVALID_REQUEST",
  "UNKNOWN_PINCODE",
  "DESTINATION_NOT_LIVE",
  "SAME_CITY",
  "ITEM_UNAVAILABLE",
  "NO_LANE",
] as const;
export type RequestReason = (typeof REQUEST_REASONS)[number];

/** Reasons a specific calendar day has no option. */
export const CALENDAR_REASONS = ["TOO_SOON", "NO_DELIVERY_ON_DAY", "BEYOND_HORIZON"] as const;
export type CalendarReason = (typeof CALENDAR_REASONS)[number];

export type ReasonCode = CandidateReason | RequestReason | CalendarReason;

export const ALL_REASON_CODES: readonly ReasonCode[] = [
  ...REQUEST_REASONS,
  ...CANDIDATE_REASONS,
  ...CALENDAR_REASONS,
];

const DEPTH = new Map<CandidateReason, number>(CANDIDATE_REASONS.map((r, i) => [r, i]));

/** The reason that got further through evaluation. */
export function deeperReason(a: CandidateReason, b: CandidateReason): CandidateReason {
  return (DEPTH.get(a) ?? 0) >= (DEPTH.get(b) ?? 0) ? a : b;
}

/** Reasons that may clear on their own (a new day, restocked inventory) vs structural ones. */
export function isTransientReason(r: ReasonCode): boolean {
  return (
    r === "CUTOFF_PASSED" || r === "SOLD_OUT" || r === "VENDOR_AT_CAPACITY" || r === "TOO_SOON"
  );
}

/** Customer-facing copy. Keep it short, plain and specific. */
export const REASON_MESSAGES: Record<ReasonCode, string> = {
  INVALID_REQUEST: "Something about this request isn't right. Please try again.",
  UNKNOWN_PINCODE: "We couldn't find that pincode.",
  DESTINATION_NOT_LIVE: "We don't deliver to this city yet.",
  SAME_CITY: "This delicacy is made in your city — we only ship between cities.",
  ITEM_UNAVAILABLE: "This item isn't available right now.",
  NO_LANE: "We don't ship from this city to your pincode yet.",
  PICKUP_CUTOFF_MISSED: "Courier pickups close before this kitchen is ready.",
  NO_RATE_CARD: "Shipping isn't priced for this route yet.",
  SHELF_LIFE_EXCEEDED: "It wouldn't stay fresh all the way to you.",
  NO_COMPATIBLE_PACKAGING: "We don't have packaging that suits these items together.",
  EXCEEDS_BOX_PAYLOAD: "Too much for one cold-chain box — split it into two orders.",
  DRY_ICE_NOT_ACCEPTED: "Couriers on this route can't carry dry ice.",
  PACKAGING_HOLD_EXCEEDED: "The journey is longer than our cold packs can hold.",
  VENDOR_CLOSED: "The kitchen doesn't dispatch on this day.",
  CARRIER_CLOSED: "Couriers aren't operating on this day.",
  CUTOFF_PASSED: "Orders for this date have closed.",
  VENDOR_AT_CAPACITY: "The kitchen is fully booked for this day.",
  SOLD_OUT: "Sold out for this date.",
  TOO_SOON: "Too soon — it can't reach you by this date.",
  NO_DELIVERY_ON_DAY: "No deliveries on this day.",
  BEYOND_HORIZON: "Not open for orders yet.",
};
