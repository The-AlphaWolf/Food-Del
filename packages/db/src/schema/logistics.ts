import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { vendors } from "./catalog";
import {
  batchStatusEnum,
  blackoutScopeEnum,
  coolantEnum,
  laneSourceEnum,
  shipModeEnum,
  tempClassEnum,
} from "./enums";
import { cities, pincodes } from "./geo";

/**
 * Box + coolant combinations. `max_hold_hours` must come from logger-validated lane trials at
 * summer peak ambient, never from supplier claims.
 */
export const packagingProfiles = pgTable(
  "packaging_profiles",
  {
    code: text("code").primaryKey(),
    name: text("name").notNull(),
    tempClass: tempClassEnum("temp_class").notNull(),
    coolant: coolantEnum("coolant").notNull(),
    maxHoldHours: smallint("max_hold_hours").notNull(),
    isDangerousGoods: boolean("is_dangerous_goods").notNull().default(false),
    outerLengthMm: integer("outer_length_mm").notNull(),
    outerBreadthMm: integer("outer_breadth_mm").notNull(),
    outerHeightMm: integer("outer_height_mm").notNull(),
    tareWeightG: integer("tare_weight_g").notNull(),
    maxPayloadG: integer("max_payload_g").notNull(),
    costPaise: integer("cost_paise").notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    check("packaging_dry_ice_is_dg", sql`${t.coolant} <> 'DRY_ICE' or ${t.isDangerousGoods}`),
    check("packaging_positive", sql`${t.maxHoldHours} > 0 and ${t.maxPayloadG} > 0`),
  ],
);

export const rateCards = pgTable(
  "rate_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carrierCode: text("carrier_code").notNull(),
    mode: shipModeEnum("mode").notNull(),
    zone: text("zone").notNull(),
    volumetricDivisor: integer("volumetric_divisor").notNull(),
    firstSlabG: integer("first_slab_g").notNull(),
    firstSlabPaise: integer("first_slab_paise").notNull(),
    addlSlabG: integer("addl_slab_g").notNull(),
    addlSlabPaise: integer("addl_slab_paise").notNull(),
    fuelSurchargeBps: integer("fuel_surcharge_bps").notNull().default(0),
    odaSurchargePaise: integer("oda_surcharge_paise").notNull().default(0),
  },
  (t) => [
    unique("rate_cards_service_zone").on(t.carrierCode, t.mode, t.zone),
    check("rate_cards_slabs", sql`${t.firstSlabG} > 0 and ${t.addlSlabG} > 0`),
  ],
);

/** Origin city × destination pincode × carrier service. */
export const serviceabilityMatrix = pgTable(
  "serviceability_matrix",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    originCityId: uuid("origin_city_id")
      .notNull()
      .references(() => cities.id),
    destPincode: char("dest_pincode", { length: 6 })
      .notNull()
      .references(() => pincodes.pincode),
    carrierCode: text("carrier_code").notNull(),
    mode: shipModeEnum("mode").notNull(),
    transitHoursP50: smallint("transit_hours_p50").notNull(),
    transitHoursP90: smallint("transit_hours_p90").notNull(),
    pickupCutoffLocal: time("pickup_cutoff_local").notNull(),
    deliversSunday: boolean("delivers_sunday").notNull().default(false),
    acceptsDryIce: boolean("accepts_dry_ice").notNull().default(false),
    rateZone: text("rate_zone").notNull(),
    source: laneSourceEnum("source").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("serviceability_lane").on(t.originCityId, t.destPincode, t.carrierCode, t.mode),
    check(
      "serviceability_transit",
      sql`${t.transitHoursP50} > 0 and ${t.transitHoursP90} >= ${t.transitHoursP50}`,
    ),
    index("serviceability_lookup").on(t.destPincode, t.originCityId).where(sql`${t.isActive}`),
  ],
);

/**
 * Days nobody dispatches (or a carrier doesn't run). `scope_ref` is the city id, vendor id or
 * carrier code; empty for national holidays.
 */
export const calendarBlackouts = pgTable(
  "calendar_blackouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: blackoutScopeEnum("scope").notNull(),
    scopeRef: text("scope_ref").notNull().default(""),
    date: date("date", { mode: "string" }).notNull(),
    reason: text("reason").notNull(),
  },
  (t) => [
    unique("blackouts_unique").on(t.scope, t.scopeRef, t.date),
    check("blackouts_scope_ref", sql`(${t.scope} = 'NATIONAL') = (${t.scopeRef} = '')`),
    index("blackouts_date_idx").on(t.date),
  ],
);

/** One courier pickup per vendor, dispatch day and carrier. */
export const dispatchBatches = pgTable(
  "dispatch_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    dispatchDate: date("dispatch_date", { mode: "string" }).notNull(),
    carrierCode: text("carrier_code").notNull(),
    status: batchStatusEnum("status").notNull().default("LOCKED"),
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
    pickupRef: text("pickup_ref"),
    handedOverAt: timestamp("handed_over_at", { withTimezone: true }),
  },
  (t) => [unique("batches_unique").on(t.vendorId, t.dispatchDate, t.carrierCode)],
);
