import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Fixed-window request counters shared by every serverless instance (an in-memory limiter would
 * reset per instance). Keys look like `orders:user:<id>` or `quotes:ip:<addr>`.
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});
