/**
 * Property tests: whatever the inputs, a plan the engine returns must never break the promises
 * the business makes — freshness at delivery, cold-chain hold time, cutoffs and capacity.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type FreshnessProfile, isPackagingCompatible, TEMP_CLASSES } from "../catalog";
import { DEFAULT_POLICY, PACKAGING, planningContext, RATE_CARDS } from "../testing/fixtures";
import {
  addDays,
  addHours,
  atIst,
  hoursBetween,
  isoWeekday,
  isWeekdayInMask,
  type LocalDate,
} from "../time/ist";
import { deliveryCalendar, planShipment } from "./planner";
import type { Lane, PlanningContext, ShipmentLine, ShipmentPlan } from "./types";

const hhmmBetween = (minHour: number, maxHour: number) =>
  fc
    .tuple(fc.integer({ min: minHour, max: maxHour }), fc.constantFrom(0, 15, 30, 45))
    .map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
const anyTime = hhmmBetween(0, 23);

/** Mostly realistic values with a steady trickle of hostile ones. */
const mostly = <T>(typical: fc.Arbitrary<T>, edge: fc.Arbitrary<T>) =>
  fc.oneof({ arbitrary: typical, weight: 4 }, { arbitrary: edge, weight: 1 });

const freshness: fc.Arbitrary<FreshnessProfile> = fc
  .record({
    tempClass: fc.oneof(
      { arbitrary: fc.constant("AMBIENT" as const), weight: 6 },
      { arbitrary: fc.constant("CHILLED" as const), weight: 3 },
      { arbitrary: fc.constantFrom(...TEMP_CLASSES), weight: 1 },
    ),
    shelfLifeHours: mostly(fc.integer({ min: 72, max: 2400 }), fc.integer({ min: 24, max: 72 })),
    residualPct: mostly(fc.integer({ min: 30, max: 40 }), fc.integer({ min: 40, max: 70 })),
    madeToOrder: fc.boolean(),
    agePct: mostly(fc.integer({ min: 0, max: 15 }), fc.integer({ min: 15, max: 30 })),
  })
  .map((r) => ({
    tempClass: r.tempClass,
    shelfLifeHours: r.shelfLifeHours,
    minResidualHours: Math.ceil((r.shelfLifeHours * r.residualPct) / 100),
    madeToOrder: r.madeToOrder,
    maxAgeAtDispatchHours: r.madeToOrder ? null : Math.floor((r.shelfLifeHours * r.agePct) / 100),
  }));

const shipmentLine: fc.Arbitrary<ShipmentLine> = fc.record({
  variantId: fc.constantFrom("v1", "v2", "v3"),
  quantity: mostly(fc.integer({ min: 1, max: 2 }), fc.integer({ min: 3, max: 8 })),
  unitPricePaise: fc.integer({ min: 10_000, max: 300_000 }),
  gstRateBps: fc.constantFrom(0, 500, 1200, 1800),
  unitPackedWeightG: mostly(
    fc.integer({ min: 100, max: 700 }),
    fc.integer({ min: 700, max: 2500 }),
  ),
  freshness,
});

const lane: fc.Arbitrary<Lane> = fc
  .record({
    carrierCode: fc.constantFrom("bluedart", "delhivery"),
    p50: mostly(fc.integer({ min: 8, max: 48 }), fc.integer({ min: 48, max: 144 })),
    spread: mostly(fc.integer({ min: 0, max: 24 }), fc.integer({ min: 24, max: 72 })),
    pickupCutoffLocal: mostly(hhmmBetween(13, 20), anyTime),
    deliversSunday: fc.boolean(),
    acceptsDryIce: fc.boolean(),
  })
  .map((r) => ({
    carrierCode: r.carrierCode,
    mode: r.carrierCode === "bluedart" ? "AIR_EXPRESS" : "SURFACE_EXPRESS",
    transitHoursP50: r.p50,
    transitHoursP90: r.p50 + r.spread,
    pickupCutoffLocal: r.pickupCutoffLocal,
    deliversSunday: r.deliversSunday,
    acceptsDryIce: r.acceptsDryIce,
    rateZone: "METRO",
  }));

const scenario: fc.Arbitrary<PlanningContext> = fc
  .record({
    nowOffsetHours: fc.integer({ min: 0, max: 24 * 14 }),
    orderCutoffLocal: anyTime,
    prepLeadDays: fc.integer({ min: 0, max: 2 }),
    prepStartLocal: anyTime,
    readyForPickupLocal: mostly(hhmmBetween(8, 13), anyTime),
    dispatchWeekdays: mostly(fc.constantFrom(63, 127, 31), fc.integer({ min: 0, max: 127 })),
    dailyShipmentCap: mostly(fc.integer({ min: 3, max: 50 }), fc.integer({ min: 0, max: 2 })),
    booked: fc.integer({ min: 0, max: 3 }),
    stock: mostly(fc.integer({ min: 4, max: 20 }), fc.integer({ min: 0, max: 3 })),
    lines: mostly(
      fc.array(shipmentLine, { minLength: 1, maxLength: 2 }),
      fc.array(shipmentLine, { minLength: 1, maxLength: 4 }),
    ),
    lanes: fc.uniqueArray(lane, { minLength: 1, maxLength: 2, selector: (l) => l.carrierCode }),
    isOda: fc.boolean(),
    blackout: fc.option(fc.integer({ min: 0, max: 20 }), { nil: null }),
  })
  .map((r) => {
    const now = addHours(atIst("2026-10-12", "00:00"), r.nowOffsetHours);
    return planningContext({
      now,
      vendor: {
        id: "v",
        orderCutoffLocal: r.orderCutoffLocal,
        prepLeadDays: r.prepLeadDays,
        prepStartLocal: r.prepStartLocal,
        readyForPickupLocal: r.readyForPickupLocal,
        dispatchWeekdays: r.dispatchWeekdays,
        dailyShipmentCap: r.dailyShipmentCap,
      },
      lines: r.lines,
      lanes: r.lanes,
      destination: { pincode: "560001", isOda: r.isOda },
      stock: r.stock,
      booked: r.booked,
      dispatchBlackouts: r.blackout == null ? [] : [addDays("2026-10-12", r.blackout)],
      packaging: PACKAGING,
      rateCards: RATE_CARDS,
      policy: DEFAULT_POLICY,
    });
  });

/** Independent oracle for when a line's food was made (the spec, restated). */
function expectedPreparedAt(ctx: PlanningContext, l: ShipmentLine, dispatchDate: LocalDate): Date {
  const packedAt = atIst(dispatchDate, ctx.vendor.readyForPickupLocal);
  if (!l.freshness.madeToOrder)
    return addHours(packedAt, -(l.freshness.maxAgeAtDispatchHours ?? 0));
  const prep = atIst(dispatchDate, ctx.vendor.prepStartLocal);
  return prep > packedAt ? addHours(prep, -24) : prep;
}

function assertPlanKeepsPromises(ctx: PlanningContext, plan: ShipmentPlan) {
  // Freshness: every line still has its minimum residual life at the p90 arrival.
  for (const l of ctx.lines) {
    const prepared = expectedPreparedAt(ctx, l, plan.dispatchDate);
    const residualAtArrival = l.freshness.shelfLifeHours - hoursBetween(prepared, plan.etaP90);
    expect(residualAtArrival).toBeGreaterThanOrEqual(l.freshness.minResidualHours);
  }
  expect(plan.etaP90.getTime()).toBeLessThanOrEqual(plan.deliverByAt.getTime());

  // Cold chain: the chosen box holds temperature for the whole journey plus buffer.
  const pkg = PACKAGING.find((p) => p.code === plan.packagingCode)!;
  for (const l of ctx.lines)
    expect(isPackagingCompatible(pkg.tempClass, l.freshness.tempClass)).toBe(true);
  expect(
    hoursBetween(plan.packedAt, plan.etaP90) + ctx.policy.handlingBufferHours,
  ).toBeLessThanOrEqual(pkg.maxHoldHours);
  const payload = ctx.lines.reduce((s, l) => s + l.unitPackedWeightG * l.quantity, 0);
  expect(payload).toBeLessThanOrEqual(pkg.maxPayloadG);

  // Ordering window, kitchen calendar and capacity.
  expect(ctx.now.getTime()).toBeLessThanOrEqual(plan.orderCutoffAt.getTime());
  expect(isWeekdayInMask(ctx.vendor.dispatchWeekdays, isoWeekday(plan.dispatchDate))).toBe(true);
  expect(ctx.blackouts.dispatch.has(plan.dispatchDate)).toBe(false);
  expect(ctx.bookedShipments(plan.dispatchDate)).toBeLessThan(ctx.vendor.dailyShipmentCap);
  for (const l of ctx.lines) {
    expect(ctx.availableUnits(l.variantId, plan.dispatchDate)).toBeGreaterThanOrEqual(l.quantity);
  }

  // No Sunday promises on lanes that don't deliver Sundays.
  const usedLane = ctx.lanes.find((x) => x.carrierCode === plan.carrierCode)!;
  if (!usedLane.deliversSunday) expect(isoWeekday(plan.promisedDeliveryDate)).not.toBe(7);

  // Fees are whole rupees and never negative.
  expect(plan.shippingFeePaise % 100).toBe(0);
  expect(plan.packagingFeePaise).toBeGreaterThanOrEqual(0);
}

describe("serviceability invariants", () => {
  it("generates scenarios where plans exist (the properties are not vacuous)", () => {
    const samples = fc.sample(scenario, { numRuns: 300, seed: 42 });
    const results = samples.map((ctx) => planShipment(ctx, { kind: "EARLIEST" }));
    const planned = results.filter((r) => r.ok).length;
    const reasons = new Set(results.flatMap((r) => (r.ok ? [] : [r.reason])));
    expect(planned).toBeGreaterThan(50);
    // ...and exercise the failure paths too.
    expect(reasons.size).toBeGreaterThanOrEqual(5);
  });

  it("never returns a plan that breaks freshness, cold chain, cutoff or capacity", () => {
    fc.assert(
      fc.property(scenario, (ctx) => {
        const r = planShipment(ctx, { kind: "EARLIEST" });
        if (r.ok) assertPlanKeepsPromises(ctx, r.plan);
      }),
      { numRuns: 600 },
    );
  });

  it("keeps every calendar promise and never beats the earliest plan", () => {
    fc.assert(
      fc.property(scenario, (ctx) => {
        const cal = deliveryCalendar(ctx, { days: ctx.policy.horizonDays });
        const earliest = planShipment(ctx, { kind: "EARLIEST" });
        for (const day of cal) {
          if (!day.plan) {
            expect(day.reason).not.toBeNull();
            continue;
          }
          expect(day.plan.promisedDeliveryDate).toBe(day.date);
          assertPlanKeepsPromises(ctx, day.plan);
          expect(earliest.ok).toBe(true);
          if (earliest.ok) {
            expect(earliest.plan.etaP90.getTime()).toBeLessThanOrEqual(day.plan.etaP90.getTime());
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it("agrees between ARRIVE_ON and the calendar", () => {
    fc.assert(
      fc.property(scenario, fc.integer({ min: 0, max: 20 }), (ctx, offset) => {
        const cal = deliveryCalendar(ctx, { days: 21 });
        const day = cal[offset]!;
        const r = planShipment(ctx, { kind: "ARRIVE_ON", date: day.date });
        if (day.plan) expect(r).toEqual({ ok: true, plan: day.plan });
        else expect(r).toEqual({ ok: false, reason: day.reason });
      }),
      { numRuns: 300 },
    );
  });
});
