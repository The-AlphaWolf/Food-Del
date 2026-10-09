import { bigint, boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Fixed-window request counters shared by every serverless instance (an in-memory limiter would
 * reset per instance). Keys look like `orders:user:<id>` or `quotes:ip:<addr>`.
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

/** One row per scheduled-job run: what ran, how long it took, what it did, whether it failed. */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    job: text("job").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    processed: integer("processed").notNull().default(0),
    ok: boolean("ok").notNull(),
    error: text("error"),
  },
  (t) => [index("job_runs_job_idx").on(t.job, t.startedAt)],
);
