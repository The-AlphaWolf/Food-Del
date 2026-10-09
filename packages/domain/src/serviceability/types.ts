import type { FreshnessProfile } from "../catalog";
import type { Paise } from "../money";
import type { PackagingProfile } from "../packaging";
import type { FeePolicy, RateCard, ShipMode } from "../pricing/rates";
import type { LocalDate, LocalTime } from "../time/ist";

/** When and how a vendor's kitchen works. All times are IST wall-clock. */
export interface VendorSchedule {
  id: string;
  /** Orders for dispatch day D close at this time on D − `prepLeadDays`. */
  orderCutoffLocal: LocalTime;
  prepLeadDays: number;
  /** Preparation start on dispatch day; a time after `readyForPickupLocal` means the evening before. */
  prepStartLocal: LocalTime;
  /** Parcels are packed and waiting for the courier from this time on dispatch day. */
  readyForPickupLocal: LocalTime;
  /** ISO weekday bitmask (bit 0 = Monday). */
  dispatchWeekdays: number;
  dailyShipmentCap: number;
}

/** One courier service from the vendor's origin city to the destination pincode. */
export interface Lane {
  carrierCode: string;
  mode: ShipMode;
  /** Hours from pickup to delivery, median. Display only. */
  transitHoursP50: number;
  /** Hours from pickup to delivery, 90th percentile. Drives every spoilage decision. */
  transitHoursP90: number;
  /** Latest courier pickup on dispatch day that still makes the day's linehaul. */
  pickupCutoffLocal: LocalTime;
  deliversSunday: boolean;
  acceptsDryIce: boolean;
  rateZone: string;
}

export interface ShipmentLine {
  variantId: string;
  quantity: number;
  unitPricePaise: Paise;
  gstRateBps: number;
  /** Weight of one unit in its primary pack. */
  unitPackedWeightG: number;
  freshness: FreshnessProfile;
}

export interface Destination {
  pincode: string;
  /** Courier "out of delivery area": slower and surcharged. */
  isOda: boolean;
}

export interface Blackouts {
  /** Dates the vendor, its origin city or the whole country cannot dispatch. */
  dispatch: ReadonlySet<LocalDate>;
  /** Per carrier: dates with no pickups and no deliveries. */
  carrier: ReadonlyMap<string, ReadonlySet<LocalDate>>;
}

export interface PlanningPolicy {
  /** How many dispatch days ahead are open for ordering. */
  horizonDays: number;
  /** Slack added to every packaging hold-time check (handover, sorting, last-mile waits). */
  handlingBufferHours: number;
  /** Extra transit time for ODA pincodes. */
  odaExtraHours: number;
  fees: FeePolicy;
}

export interface PlanningContext {
  now: Date;
  vendor: VendorSchedule;
  destination: Destination;
  lines: readonly ShipmentLine[];
  lanes: readonly Lane[];
  packaging: readonly PackagingProfile[];
  rateCards: readonly RateCard[];
  blackouts: Blackouts;
  /** Units still sellable for a variant on a dispatch date (0 when no slot is open). */
  availableUnits(variantId: string, dispatchDate: LocalDate): number;
  /** Shipments already booked for this vendor on a dispatch date. */
  bookedShipments(dispatchDate: LocalDate): number;
  policy: PlanningPolicy;
}

export type PlanGoal =
  | { kind: "EARLIEST" }
  /** Arrive on exactly this date (gifting): promised p90 delivery date equals `date`. */
  | { kind: "ARRIVE_ON"; date: LocalDate };

/** A fully priced, feasible way to get one shipment to the customer. */
export interface ShipmentPlan {
  dispatchDate: LocalDate;
  carrierCode: string;
  mode: ShipMode;
  rateZone: string;
  packagingCode: string;
  orderCutoffAt: Date;
  /** Preparation time of the oldest food in the parcel. */
  preparedAt: Date;
  packedAt: Date;
  /** Latest the courier may collect the parcel (lane pickup cutoff). */
  pickupBy: Date;
  etaP50: Date;
  etaP90: Date;
  usuallyArrivesOn: LocalDate;
  /** "Arrives by" date shown to the customer (IST date of `etaP90`). */
  promisedDeliveryDate: LocalDate;
  /** Spoilage deadline: after this, residual shelf life falls below the policy floor. */
  deliverByAt: Date;
  /** Hours between `etaP90` and `deliverByAt` (≥ 0 for every feasible plan). */
  freshnessMarginHours: number;
  deadWeightG: number;
  chargeableWeightG: number;
  shippingCostPaise: Paise;
  shippingFeePaise: Paise;
  packagingFeePaise: Paise;
  itemsTotalPaise: Paise;
  /** Fewest units left across the parcel's variants for this dispatch date. */
  remainingUnits: number;
}
