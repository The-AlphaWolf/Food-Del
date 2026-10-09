import { describe, expect, it } from "vitest";
import { rupees } from "../money";
import {
  AIR_LANE,
  CANNED_ROSOGOLLA,
  KAJU_KATLI,
  line,
  NOLEN_GUR_SANDESH,
  PACKAGING,
  planningContext,
  RATE_CARDS,
  SURFACE_LANE,
  vendorSchedule,
} from "../testing/fixtures";
import { atIst, hoursBetween } from "../time/ist";
import { deliveryCalendar, planShipment } from "./planner";

const earliest = { kind: "EARLIEST" } as const;
const sandesh = [line(NOLEN_GUR_SANDESH)];

function planOrThrow(
  ctx: Parameters<typeof planShipment>[0],
  goal: Parameters<typeof planShipment>[1] = earliest,
) {
  const r = planShipment(ctx, goal);
  if (!r.ok) throw new Error(`expected a plan, got ${r.reason}`);
  return r.plan;
}

describe("planShipment — ambient delicacies", () => {
  it("dispatches tomorrow by air and promises the p90 date", () => {
    const plan = planOrThrow(planningContext());
    expect(plan.dispatchDate).toBe("2026-10-13");
    expect(plan.mode).toBe("AIR_EXPRESS");
    expect(plan.packagingCode).toBe("AMBIENT_BOX");
    // Pickup Tue 16:00 + 36 h = Thu 04:00 IST; usually Wed 16:00.
    expect(plan.etaP90.toISOString()).toBe(atIst("2026-10-15", "04:00").toISOString());
    expect(plan.promisedDeliveryDate).toBe("2026-10-15");
    expect(plan.usuallyArrivesOn).toBe("2026-10-14");
  });

  it("prices on volumetric weight with markup", () => {
    const plan = planOrThrow(planningContext());
    // Box 25×20×12 cm = 1.2 kg volumetric > 0.8 kg dead weight.
    expect(plan.deadWeightG).toBe(800);
    expect(plan.chargeableWeightG).toBe(1200);
    expect(plan.shippingFeePaise).toBe(rupees(399));
    expect(plan.packagingFeePaise).toBe(rupees(40));
    expect(plan.itemsTotalPaise).toBe(rupees(650));
  });

  it("moves to the next dispatch day once today's cutoff passes", () => {
    const plan = planOrThrow(planningContext({ now: atIst("2026-10-12", "18:01") }));
    expect(plan.dispatchDate).toBe("2026-10-14");
    expect(plan.orderCutoffAt.toISOString()).toBe(atIst("2026-10-13", "18:00").toISOString());
  });

  it("skips vendor closures and festival blackouts", () => {
    const plan = planOrThrow(planningContext({ dispatchBlackouts: ["2026-10-13", "2026-10-14"] }));
    expect(plan.dispatchDate).toBe("2026-10-15");
  });

  it("falls back to surface when the kitchen is ready after the air pickup cutoff", () => {
    const plan = planOrThrow(
      planningContext({ vendor: vendorSchedule({ readyForPickupLocal: "16:30" }) }),
    );
    expect(plan.mode).toBe("SURFACE_EXPRESS");
    expect(plan.carrierCode).toBe("delhivery");
  });

  it("plans shelf-stable stock with a maximum age at dispatch", () => {
    const plan = planOrThrow(planningContext({ lines: [line(CANNED_ROSOGOLLA)] }));
    expect(hoursBetween(plan.preparedAt, plan.packedAt)).toBe(720);
    expect(plan.freshnessMarginHours).toBeGreaterThan(1000);
  });
});

describe("planShipment — chilled delicacies", () => {
  it("needs the 48 h cold pack for a 40 h journey plus handling buffer", () => {
    const plan = planOrThrow(planningContext({ lines: sandesh }));
    expect(plan.mode).toBe("AIR_EXPRESS");
    expect(plan.packagingCode).toBe("PCM_CHILL_48");
    // Prepared Tue 06:00 + (72 − 22) h = Thu 08:00; arrives by Thu 04:00.
    expect(plan.deliverByAt.toISOString()).toBe(atIst("2026-10-15", "08:00").toISOString());
    expect(plan.freshnessMarginHours).toBe(4);
  });

  it("refuses surface transport for a three-day sweet", () => {
    const r = planShipment(planningContext({ lines: sandesh, lanes: [SURFACE_LANE] }), earliest);
    expect(r).toEqual({ ok: false, reason: "SHELF_LIFE_EXCEEDED" });
  });

  it("refuses ODA pincodes when the extra day breaks freshness", () => {
    const r = planShipment(
      planningContext({ lines: sandesh, destination: { pincode: "741101", isOda: true } }),
      earliest,
    );
    expect(r).toEqual({ ok: false, reason: "SHELF_LIFE_EXCEEDED" });
  });

  it("counts a Sunday wait against shelf life", () => {
    // Friday dispatch would land Sunday 04:00 and wait until Monday — too late for sandesh.
    const cal = deliveryCalendar(planningContext({ lines: sandesh }), { days: 10 });
    const fridayDispatch = cal.find((d) => d.plan?.dispatchDate === "2026-10-16");
    expect(fridayDispatch).toBeUndefined();
    expect(cal.find((d) => d.date === "2026-10-18")?.reason).toBe("NO_DELIVERY_ON_DAY");
  });

  it("treats overnight preparation as older food", () => {
    const r = planShipment(
      planningContext({ lines: sandesh, vendor: vendorSchedule({ prepStartLocal: "22:00" }) }),
      earliest,
    );
    expect(r).toEqual({ ok: false, reason: "SHELF_LIFE_EXCEEDED" });
  });

  it("rolls past carrier holidays, which can break freshness", () => {
    const r = planShipment(
      planningContext({
        lines: sandesh,
        lanes: [AIR_LANE],
        carrierBlackouts: { bluedart: ["2026-10-15"] },
      }),
      earliest,
    );
    // Tue dispatch now lands Fri; Wed dispatch can't be picked up Thu; the plan moves later.
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.dispatchDate).not.toBe("2026-10-13");
  });

  it("puts ambient items in the chilled box when they travel with chilled ones", () => {
    const plan = planOrThrow(planningContext({ lines: [line(KAJU_KATLI), ...sandesh] }));
    expect(plan.packagingCode).toBe("PCM_CHILL_48");
  });

  it("rejects parcels heavier than any compatible box", () => {
    const heavy = [line(NOLEN_GUR_SANDESH, { quantity: 7 })];
    expect(planShipment(planningContext({ lines: heavy }), earliest)).toEqual({
      ok: false,
      reason: "EXCEEDS_BOX_PAYLOAD",
    });
  });
});

describe("planShipment — frozen goods", () => {
  const frozen = [
    line({
      ...NOLEN_GUR_SANDESH,
      tempClass: "FROZEN",
      shelfLifeHours: 2160,
      minResidualHours: 648,
    }),
  ];

  it("needs a carrier that accepts dry ice", () => {
    expect(planShipment(planningContext({ lines: frozen }), earliest)).toEqual({
      ok: false,
      reason: "DRY_ICE_NOT_ACCEPTED",
    });
    const plan = planOrThrow(
      planningContext({ lines: frozen, lanes: [{ ...AIR_LANE, acceptsDryIce: true }] }),
    );
    expect(plan.packagingCode).toBe("DRY_ICE_FROZEN");
  });
});

describe("planShipment — capacity", () => {
  it("reports sold out when no dispatch day has stock", () => {
    expect(planShipment(planningContext({ stock: 0 }), earliest)).toEqual({
      ok: false,
      reason: "SOLD_OUT",
    });
  });

  it("uses the next day with stock and reports remaining units", () => {
    const plan = planOrThrow(planningContext({ stock: (_v, d) => (d === "2026-10-13" ? 0 : 7) }));
    expect(plan.dispatchDate).toBe("2026-10-14");
    expect(plan.remainingUnits).toBe(7);
  });

  it("respects the kitchen's daily shipment cap", () => {
    expect(planShipment(planningContext({ booked: 50 }), earliest)).toEqual({
      ok: false,
      reason: "VENDOR_AT_CAPACITY",
    });
  });
});

describe("planShipment — configuration problems", () => {
  it("rejects invalid input", () => {
    expect(
      planShipment(planningContext({ lines: [line(KAJU_KATLI, { quantity: 0 })] }), earliest),
    ).toEqual({ ok: false, reason: "INVALID_REQUEST" });
  });

  it("reports a missing lane or rate card", () => {
    expect(planShipment(planningContext({ lanes: [] }), earliest)).toEqual({
      ok: false,
      reason: "NO_LANE",
    });
    expect(planShipment(planningContext({ rateCards: [] }), earliest)).toEqual({
      ok: false,
      reason: "NO_RATE_CARD",
    });
  });

  it("is deterministic", () => {
    const a = planShipment(planningContext({ lines: sandesh }), earliest);
    const b = planShipment(planningContext({ lines: sandesh }), earliest);
    expect(a).toEqual(b);
  });
});

describe("planShipment — arrive on a chosen date (gifting)", () => {
  it("chooses the cheapest option for shelf-stable goods", () => {
    // Monday 19th: air from Sat 17th (₹399) or surface from Wed 14th (₹171).
    const plan = planOrThrow(planningContext(), { kind: "ARRIVE_ON", date: "2026-10-19" });
    expect(plan.mode).toBe("SURFACE_EXPRESS");
    expect(plan.promisedDeliveryDate).toBe("2026-10-19");
  });

  it("chooses the freshest option for perishables, even when it costs more", () => {
    const chilledCheesecake = line({
      ...NOLEN_GUR_SANDESH,
      shelfLifeHours: 240,
      minResidualHours: 72,
    });
    const slowAir = { ...AIR_LANE, carrierCode: "slowair", transitHoursP90: 60 };
    const ctx = planningContext({
      lines: [chilledCheesecake],
      lanes: [AIR_LANE, slowAir],
      packaging: [...PACKAGING, { ...PACKAGING[2]!, code: "PCM_CHILL_120", maxHoldHours: 120 }],
      rateCards: [
        ...RATE_CARDS,
        {
          ...RATE_CARDS[0]!,
          carrierCode: "slowair",
          firstSlabPaise: rupees(10),
          addlSlabPaise: rupees(10),
        },
      ],
    });
    // Both arrive Friday: slow air from Tuesday (cheap) or express air from Wednesday (fresher).
    const plan = planOrThrow(ctx, { kind: "ARRIVE_ON", date: "2026-10-16" });
    expect(plan.carrierCode).toBe("bluedart");
    expect(plan.dispatchDate).toBe("2026-10-14");
  });

  it("never puts chilled goods on dry ice, even beside frozen ones", () => {
    const mixed = [
      line({
        ...NOLEN_GUR_SANDESH,
        tempClass: "FROZEN",
        shelfLifeHours: 2160,
        minResidualHours: 648,
      }),
      ...sandesh,
    ];
    const r = planShipment(
      planningContext({ lines: mixed, lanes: [{ ...AIR_LANE, acceptsDryIce: true }] }),
      earliest,
    );
    expect(r).toEqual({ ok: false, reason: "NO_COMPATIBLE_PACKAGING" });
  });

  it("explains days that cannot work", () => {
    const today = planShipment(planningContext(), { kind: "ARRIVE_ON", date: "2026-10-12" });
    expect(today).toEqual({ ok: false, reason: "TOO_SOON" });
    const sunday = planShipment(planningContext(), { kind: "ARRIVE_ON", date: "2026-10-18" });
    expect(sunday).toEqual({ ok: false, reason: "NO_DELIVERY_ON_DAY" });
    const cutoff = planShipment(planningContext(), { kind: "ARRIVE_ON", date: "2026-10-14" });
    expect(cutoff).toEqual({ ok: false, reason: "CUTOFF_PASSED" });
  });
});

describe("deliveryCalendar", () => {
  it("lists every day with a plan or a reason", () => {
    const cal = deliveryCalendar(planningContext({ lines: sandesh }), { days: 10 });
    expect(cal).toHaveLength(10);
    expect(cal.map((d) => d.plan?.promisedDeliveryDate ?? d.reason)).toEqual([
      "TOO_SOON",
      "TOO_SOON",
      "CUTOFF_PASSED",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "NO_DELIVERY_ON_DAY",
      "2026-10-19",
      "VENDOR_CLOSED",
      "2026-10-21",
    ]);
  });

  it("surfaces sold-out dates distinctly from closed ones", () => {
    const cal = deliveryCalendar(
      planningContext({ lines: sandesh, stock: (_v, d) => (d === "2026-10-14" ? 0 : 5) }),
      { days: 6 },
    );
    expect(cal.find((d) => d.date === "2026-10-16")?.reason).toBe("SOLD_OUT");
  });

  it("uses the configured packaging catalogue only", () => {
    const cal = deliveryCalendar(
      planningContext({
        lines: sandesh,
        packaging: PACKAGING.filter((p) => p.code !== "PCM_CHILL_48"),
      }),
      { days: 6 },
    );
    expect(cal.every((d) => d.plan === null)).toBe(true);
    expect(cal.some((d) => d.reason === "PACKAGING_HOLD_EXCEEDED")).toBe(true);
  });
});
