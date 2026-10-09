import { describe, expect, it } from "vitest";
import { rupees } from "../money";
import { planShipment } from "../serviceability/planner";
import { KAJU_KATLI, line, NOLEN_GUR_SANDESH, planningContext } from "../testing/fixtures";
import { groupIntoShipments, quoteTotals } from "./quote";
import { DEFAULT_FEE_POLICY } from "./rates";

describe("groupIntoShipments", () => {
  it("makes one parcel per vendor and arrival date, keeping frozen goods apart", () => {
    const groups = groupIntoShipments([
      { id: 1, vendorId: "a", arriveOn: null, tempClass: "AMBIENT" as const },
      { id: 2, vendorId: "b", arriveOn: null, tempClass: "CHILLED" as const },
      { id: 3, vendorId: "a", arriveOn: null, tempClass: "CHILLED" as const },
      { id: 4, vendorId: "a", arriveOn: "2026-10-20", tempClass: "AMBIENT" as const },
      { id: 5, vendorId: "a", arriveOn: null, tempClass: "FROZEN" as const },
    ]);
    expect(groups.map((g) => g.lines.map((l) => l.id))).toEqual([[1, 3], [2], [4], [5]]);
    expect(groups[2]!.arriveOn).toBe("2026-10-20");
  });
});

describe("quoteTotals", () => {
  const katli = [line(KAJU_KATLI, { quantity: 2, unitPricePaise: rupees(525) })];
  const sandesh = [line(NOLEN_GUR_SANDESH)];

  it("adds items, fees and GST across shipments", () => {
    const a = {
      lines: katli,
      result: planShipment(planningContext({ lines: katli }), { kind: "EARLIEST" }),
    };
    const b = {
      lines: sandesh,
      result: planShipment(planningContext({ lines: sandesh }), { kind: "EARLIEST" }),
    };
    const t = quoteTotals([a, b], DEFAULT_FEE_POLICY);
    expect(t.isComplete).toBe(true);
    expect(t.itemsTotalPaise).toBe(rupees(1050 + 650));
    expect(t.grandTotalPaise).toBe(t.itemsTotalPaise + t.shippingFeePaise + t.packagingFeePaise);
    // 5% GST inside ₹1,700 of sweets = ₹80.95.
    expect(t.gstIncludedPaise).toBe(8095);
  });

  it("marks quotes with an unplannable shipment as incomplete", () => {
    const failing = { lines: sandesh, result: { ok: false as const, reason: "SOLD_OUT" as const } };
    const t = quoteTotals([failing], DEFAULT_FEE_POLICY);
    expect(t.isComplete).toBe(false);
    expect(t.shippingFeePaise).toBe(0);
  });

  it("applies the shipping subsidy above the threshold", () => {
    const result = planShipment(planningContext({ lines: katli }), { kind: "EARLIEST" });
    const t = quoteTotals([{ lines: katli, result }], {
      ...DEFAULT_FEE_POLICY,
      subsidyThresholdPaise: rupees(1000),
      shippingSubsidyPaise: rupees(100),
    });
    expect(t.discountPaise).toBe(rupees(100));
  });
});
