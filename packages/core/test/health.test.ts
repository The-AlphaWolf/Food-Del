import { schema } from "@food-del/db";
import { DEV_CUSTOMER, DEV_OPS } from "@food-del/db/seed";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lateAfterMinutes } from "../src/services/health";
import { createTestCore, type TestCore } from "../src/testing";
import type { Viewer } from "../src/viewer";

let t: TestCore;
let ops: Viewer;
let customer: Viewer;

const jobOf = async (job: string) =>
  (await t.core.monitoring.system(ops)).jobs.find((j) => j.job === job)!;

beforeAll(async () => {
  t = await createTestCore({ now: new Date("2026-10-12T05:30:00Z") });
  ops = (await t.core.accounts.resolveViewer(DEV_OPS.id))!;
  customer = (await t.core.accounts.resolveViewer(DEV_CUSTOMER.id))!;
});
afterAll(async () => {
  await t?.close();
});

describe("system health", () => {
  it("is only for ops", async () => {
    await expect(t.core.monitoring.system(customer)).rejects.toMatchObject({ status: 403 });
    await expect(t.core.monitoring.system(null)).rejects.toMatchObject({ status: 401 });
  });

  it("allows a job a few missed runs before calling it late", () => {
    expect(lateAfterMinutes(1)).toBe(11);
    expect(lateAfterMinutes(5)).toBe(15);
    expect(lateAfterMinutes(60)).toBe(180);
  });

  it("records each job run and flags jobs that stop running", async () => {
    expect((await jobOf("process-outbox")).health).toBe("NEVER_RUN");
    expect(await t.core.monitoring.ready()).toBe(true);

    await t.core.runJob("process-outbox");
    const ran = await jobOf("process-outbox");
    expect(ran).toMatchObject({
      health: "OK",
      cadenceMinutes: 1,
      lastRunAt: t.clock.now.toISOString(),
      lastOkAt: t.clock.now.toISOString(),
      lastError: null,
      failuresLast24h: 0,
    });
    expect(ran.lastProcessed).toBeGreaterThanOrEqual(0);
    expect(ran.avgDurationMs).toBeGreaterThanOrEqual(0);

    // Cron stopped: twelve minutes without a run is late, and the platform is no longer ready.
    t.clock.set(new Date(t.clock.now.getTime() + 12 * 60_000));
    const h = await t.core.monitoring.system(ops);
    expect(h.jobs.find((j) => j.job === "process-outbox")!.health).toBe("LATE");
    expect(h.status).toBe("DEGRADED");
    expect(await t.core.monitoring.ready()).toBe(false);

    await t.core.runJob("process-outbox");
    expect(await t.core.monitoring.ready()).toBe(true);
  });

  it("keeps a failing job's error and still rethrows it", async () => {
    await expect(
      t.core.monitoring.record("release-payouts", async () => {
        throw new Error("Razorpay said no");
      }),
    ).rejects.toThrow("Razorpay said no");
    const j = await jobOf("release-payouts");
    expect(j).toMatchObject({
      health: "FAILING",
      lastError: "Razorpay said no",
      failuresLast24h: 1,
    });
    expect(j.lastOkAt).toBeNull();

    await t.core.runJob("release-payouts");
    const fixed = await jobOf("release-payouts");
    expect(fixed).toMatchObject({ health: "OK", lastError: null, failuresLast24h: 1 });
  });

  it("is not ready while due queued work goes unprocessed", async () => {
    const [stale] = await t.handle.db
      .insert(schema.outbox)
      .values({
        topic: "notify",
        payload: {},
        availableAt: new Date(t.clock.now.getTime() - 20 * 60_000),
      })
      .returning({ id: schema.outbox.id });
    const h = await t.core.monitoring.system(ops);
    expect(h.outbox.due).toBeGreaterThanOrEqual(1);
    expect(h.outbox.oldestDueAgeSeconds).toBeGreaterThanOrEqual(20 * 60);
    expect(await t.core.monitoring.ready()).toBe(false);

    await t.handle.db
      .update(schema.outbox)
      .set({ status: "DONE" })
      .where(eq(schema.outbox.id, stale!.id));
    expect(await t.core.monitoring.ready()).toBe(true);
  });

  it("forgets job history after two weeks", async () => {
    const before = await t.handle.db.select().from(schema.jobRuns);
    expect(before.length).toBeGreaterThan(0);
    t.clock.set(new Date(t.clock.now.getTime() + 15 * 86_400_000));
    const r = await t.core.runJob("housekeeping");
    expect(r.processed).toBeGreaterThanOrEqual(before.length);
    const after = await t.handle.db.select().from(schema.jobRuns);
    expect(after.map((a) => a.job)).toEqual(["housekeeping"]);
  });
});
