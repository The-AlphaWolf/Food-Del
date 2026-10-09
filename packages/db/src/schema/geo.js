import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { cityLaunchStatusEnum } from "./enums";
/** Commercial metro areas (Gurugram and Noida belong to `delhi-ncr`), not administrative cities. */
export const cities = pgTable("cities", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  stateCode: char("state_code", { length: 2 }).notNull(),
  airportIata: char("airport_iata", { length: 3 }),
  isOrigin: boolean("is_origin").notNull().default(false),
  isDestination: boolean("is_destination").notNull().default(false),
  launchStatus: cityLaunchStatusEnum("launch_status").notNull().default("HIDDEN"),
  tagline: text("tagline"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
/** Seeded from the India Post pincode directory. */
export const pincodes = pgTable(
  "pincodes",
  {
    pincode: char("pincode", { length: 6 }).primaryKey(),
    cityId: uuid("city_id").references(() => cities.id),
    areaName: text("area_name"),
    district: text("district").notNull(),
    stateCode: char("state_code", { length: 2 }).notNull(),
    /** Courier "out of delivery area": slower and surcharged. */
    isOda: boolean("is_oda").notNull().default(false),
  },
  (t) => [
    check("pincodes_format", sql`${t.pincode} ~ '^[1-9][0-9]{5}$'`),
    index("pincodes_city_idx").on(t.cityId),
  ],
);
