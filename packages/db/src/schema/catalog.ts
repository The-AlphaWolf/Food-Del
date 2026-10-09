import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  dietEnum,
  fulfillmentModeEnum,
  itemStatusEnum,
  tempClassEnum,
  vendorStatusEnum,
} from "./enums";
import { cities, pincodes } from "./geo";

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export interface PickupAddress {
  line1: string;
  line2?: string;
  landmark?: string;
  contactName: string;
  contactPhone: string;
}

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cityId: uuid("city_id")
      .notNull()
      .references(() => cities.id),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    tagline: text("tagline"),
    story: text("story"),
    establishedYear: smallint("established_year"),
    pickupPincode: char("pickup_pincode", { length: 6 })
      .notNull()
      .references(() => pincodes.pincode),
    pickupAddress: jsonb("pickup_address").$type<PickupAddress>().notNull(),
    fssaiLicenseNo: char("fssai_license_no", { length: 14 }).notNull(),
    fssaiValidUntil: date("fssai_valid_until", { mode: "string" }).notNull(),
    gstin: char("gstin", { length: 15 }),
    fulfillmentMode: fulfillmentModeEnum("fulfillment_mode").notNull().default("VENDOR_PACKED"),
    /** IST; orders for dispatch day D close at this time on D − prep_lead_days. */
    orderCutoffLocal: time("order_cutoff_local").notNull().default("18:00"),
    prepLeadDays: smallint("prep_lead_days").notNull().default(1),
    prepStartLocal: time("prep_start_local").notNull().default("06:00"),
    readyForPickupLocal: time("ready_for_pickup_local").notNull().default("12:00"),
    /** ISO weekday bitmask, bit 0 = Monday (63 = Mon–Sat). */
    dispatchWeekdays: smallint("dispatch_weekdays").notNull().default(63),
    dailyShipmentCap: integer("daily_shipment_cap").notNull(),
    commissionBps: integer("commission_bps").notNull().default(2000),
    payoutAccountRef: text("payout_account_ref"),
    status: vendorStatusEnum("status").notNull().default("ONBOARDING"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("vendors_fssai_format", sql`${t.fssaiLicenseNo} ~ '^[0-9]{14}$'`),
    check("vendors_weekdays", sql`${t.dispatchWeekdays} between 0 and 127`),
    check("vendors_cap", sql`${t.dailyShipmentCap} >= 0`),
    check("vendors_commission", sql`${t.commissionBps} between 0 and 10000`),
    index("vendors_city_idx").on(t.cityId),
  ],
);

/** Legal Metrology / FSSAI declarations shown on the product page. */
export interface LegalDeclarations {
  manufacturer: string;
  netQuantityNote?: string;
  ingredients: string;
  allergens: string[];
  storage: string;
  countryOfOrigin: "India";
}

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    shortDescription: text("short_description").notNull(),
    description: text("description"),
    originStory: text("origin_story"),
    diet: dietEnum("diet").notNull(),
    tempClass: tempClassEnum("temp_class").notNull(),
    shelfLifeHours: integer("shelf_life_hours").notNull(),
    minResidualHours: integer("min_residual_hours").notNull(),
    madeToOrder: boolean("made_to_order").notNull().default(true),
    maxAgeAtDispatchHours: integer("max_age_at_dispatch_hours"),
    hsnCode: varchar("hsn_code", { length: 8 }).notNull(),
    gstRateBps: integer("gst_rate_bps").notNull(),
    legal: jsonb("legal").$type<LegalDeclarations>().notNull(),
    imageUrl: text("image_url"),
    /** Visual motif key for illustrated placeholders until photography lands. */
    artKey: text("art_key"),
    isFeatured: boolean("is_featured").notNull().default(false),
    status: itemStatusEnum("status").notNull().default("DRAFT"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("items_shelf_life", sql`${t.shelfLifeHours} > 0`),
    check(
      "items_residual",
      sql`${t.minResidualHours} >= 0 and ${t.minResidualHours} < ${t.shelfLifeHours}`,
    ),
    check("items_stock_age", sql`${t.madeToOrder} or ${t.maxAgeAtDispatchHours} is not null`),
    check("items_gst", sql`${t.gstRateBps} between 0 and 2800`),
    index("items_vendor_idx").on(t.vendorId),
    index("items_category_idx").on(t.categoryId),
  ],
);

export const itemVariants = pgTable(
  "item_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    sku: text("sku").notNull().unique(),
    label: text("label").notNull(),
    /** GST-inclusive, as displayed. */
    pricePaise: integer("price_paise").notNull(),
    mrpPaise: integer("mrp_paise"),
    netWeightG: integer("net_weight_g").notNull(),
    /** Including primary pack; drives box choice and freight. */
    packedWeightG: integer("packed_weight_g").notNull(),
    defaultDailyCap: integer("default_daily_cap").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    check("variants_price", sql`${t.pricePaise} > 0`),
    check("variants_mrp", sql`${t.mrpPaise} is null or ${t.mrpPaise} >= ${t.pricePaise}`),
    check("variants_weights", sql`${t.netWeightG} > 0 and ${t.packedWeightG} >= ${t.netWeightG}`),
    check("variants_cap", sql`${t.defaultDailyCap} >= 0`),
    index("variants_item_idx").on(t.itemId),
  ],
);

/**
 * Daily production caps per variant, materialised ~30 days ahead. The check constraint makes
 * overselling impossible even under concurrent checkouts.
 */
export const inventorySlots = pgTable(
  "inventory_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => itemVariants.id, { onDelete: "cascade" }),
    dispatchDate: date("dispatch_date", { mode: "string" }).notNull(),
    capacity: integer("capacity").notNull(),
    reserved: integer("reserved").notNull().default(0),
    sold: integer("sold").notNull().default(0),
  },
  (t) => [
    unique("inventory_slots_variant_date").on(t.variantId, t.dispatchDate),
    check(
      "inventory_slots_no_oversell",
      sql`${t.capacity} >= 0 and ${t.reserved} >= 0 and ${t.sold} >= 0 and ${t.reserved} + ${t.sold} <= ${t.capacity}`,
    ),
    index("inventory_slots_date_idx").on(t.dispatchDate),
  ],
);
