import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { vendors } from "./catalog";
import { roleEnum } from "./enums";
import { pincodes } from "./geo";

/**
 * One row per person. In production `id` equals the Supabase `auth.users.id` (the foreign key is
 * added by `supabase/migrations`, which only exist there).
 */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: varchar("phone", { length: 13 }).unique(),
  email: text("email"),
  fullName: text("full_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /**
   * Set when the person deletes their account: contact details are erased, the row stays so
   * orders (tax records) keep a valid customer reference.
   */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/**
 * DPDP evidence: when someone was shown which version of the privacy notice, exported their
 * data or erased their account. Append-only; never holds the personal data itself.
 */
export const privacyEvents = pgTable(
  "privacy_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    kind: varchar("kind", { length: 32 })
      .$type<"NOTICE_ACKNOWLEDGED" | "DATA_EXPORTED" | "ACCOUNT_DELETED">()
      .notNull(),
    noticeVersion: text("notice_version"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("privacy_events_user_idx").on(t.userId, t.at)],
);

/** Roles beyond plain customer. Vendor roles are scoped to one vendor. */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_unique").on(
      t.userId,
      t.role,
      sql`coalesce(${t.vendorId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    index("memberships_vendor_idx").on(t.vendorId),
  ],
);

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    label: text("label"),
    recipientName: text("recipient_name").notNull(),
    phone: varchar("phone", { length: 13 }).notNull(),
    line1: text("line1").notNull(),
    line2: text("line2"),
    landmark: text("landmark"),
    pincode: char("pincode", { length: 6 })
      .notNull()
      .references(() => pincodes.pincode),
    cityName: text("city_name").notNull(),
    stateCode: char("state_code", { length: 2 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("addresses_user_idx").on(t.userId)],
);
