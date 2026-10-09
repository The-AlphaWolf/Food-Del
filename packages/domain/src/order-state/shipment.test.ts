import { describe, expect, it } from "vitest";
import { atIst } from "../time/ist";
import { deriveOrderStatus } from "./order";
import {
  assertTransition,
  CUSTOMER_TIMELINE,
  canCustomerCancel,
  canTransition,
  decideCarrierEvent,
  IllegalTransitionError,
  isTerminal,
  nextStatuses,
  refundPolicyFor,
  SHIPMENT_STATUSES,
  type ShipmentStatus,
  timelinePosition,
} from "./shipment";

describe("shipment state machine", () => {
  it("walks the intercity happy path", () => {
    const path: [ShipmentStatus, ShipmentStatus, Parameters<typeof canTransition>[2]][] = [
      ["PENDING_PAYMENT", "PLACED", "SYSTEM"],
      ["PLACED", "BATCHED", "SYSTEM"],
      ["BATCHED", "PACKED_COLD_CHAIN", "VENDOR"],
      ["PACKED_COLD_CHAIN", "PICKED_UP", "CARRIER"],
      ["PICKED_UP", "IN_TRANSIT_INTERCITY", "CARRIER"],
      ["IN_TRANSIT_INTERCITY", "AT_DESTINATION_HUB", "CARRIER"],
      ["AT_DESTINATION_HUB", "OUT_FOR_LOCAL_DELIVERY", "CARRIER"],
      ["OUT_FOR_LOCAL_DELIVERY", "DELIVERED", "CARRIER"],
    ];
    for (const [from, to, actor] of path) expect(canTransition(from, to, actor)).toBe(true);
  });

  it("lets carriers skip scans forward but never move back", () => {
    expect(canTransition("PICKED_UP", "OUT_FOR_LOCAL_DELIVERY", "CARRIER")).toBe(true);
    expect(canTransition("OUT_FOR_LOCAL_DELIVERY", "IN_TRANSIT_INTERCITY", "CARRIER")).toBe(false);
  });

  it("keeps each actor in its lane", () => {
    expect(canTransition("PLACED", "BATCHED", "CUSTOMER")).toBe(false);
    expect(canTransition("BATCHED", "PACKED_COLD_CHAIN", "CARRIER")).toBe(false);
    expect(canTransition("PLACED", "CANCELLED", "CUSTOMER")).toBe(true);
    expect(canTransition("BATCHED", "CANCELLED", "CUSTOMER")).toBe(false);
    expect(nextStatuses("BATCHED", "VENDOR").sort()).toEqual(["FAILED", "PACKED_COLD_CHAIN"]);
  });

  it("re-attempts failed deliveries", () => {
    expect(canTransition("OUT_FOR_LOCAL_DELIVERY", "DELIVERY_ATTEMPT_FAILED", "CARRIER")).toBe(
      true,
    );
    expect(canTransition("DELIVERY_ATTEMPT_FAILED", "OUT_FOR_LOCAL_DELIVERY", "CARRIER")).toBe(
      true,
    );
    expect(canTransition("DELIVERY_ATTEMPT_FAILED", "FAILED", "OPS")).toBe(true);
  });

  it("has no way out of terminal states", () => {
    for (const terminal of ["DELIVERED", "CANCELLED", "FAILED"] as const) {
      expect(isTerminal(terminal)).toBe(true);
      for (const to of SHIPMENT_STATUSES) {
        for (const actor of ["SYSTEM", "CUSTOMER", "VENDOR", "OPS", "CARRIER"] as const) {
          expect(canTransition(terminal, to, actor)).toBe(false);
        }
      }
    }
  });

  it("requires a failure reason exactly when failing", () => {
    expect(() =>
      assertTransition({ from: "BATCHED", to: "FAILED", actor: "VENDOR", failureReason: null }),
    ).toThrow(/failure reason/);
    expect(() =>
      assertTransition({
        from: "BATCHED",
        to: "FAILED",
        actor: "VENDOR",
        failureReason: "VENDOR_UNFULFILLED",
      }),
    ).not.toThrow();
    expect(() =>
      assertTransition({ from: "PLACED", to: "BATCHED", actor: "SYSTEM", failureReason: "LOST" }),
    ).toThrow(/Only FAILED/);
    expect(() => assertTransition({ from: "DELIVERED", to: "PLACED", actor: "OPS" })).toThrow(
      IllegalTransitionError,
    );
  });
});

describe("carrier events", () => {
  it("applies forward moves and drops duplicates or stale scans", () => {
    expect(decideCarrierEvent("PACKED_COLD_CHAIN", "PICKED_UP")).toBe("APPLY");
    expect(decideCarrierEvent("PICKED_UP", "PICKED_UP")).toBe("IGNORE_STALE");
    expect(decideCarrierEvent("AT_DESTINATION_HUB", "IN_TRANSIT_INTERCITY")).toBe("IGNORE_STALE");
    expect(decideCarrierEvent("DELIVERED", "OUT_FOR_LOCAL_DELIVERY")).toBe("IGNORE_STALE");
    expect(decideCarrierEvent("DELIVERY_ATTEMPT_FAILED", "IN_TRANSIT_INTERCITY")).toBe(
      "IGNORE_STALE",
    );
  });

  it("flags carrier scans for parcels that were never packed", () => {
    expect(decideCarrierEvent("BATCHED", "PICKED_UP")).toBe("IGNORE_INVALID");
  });
});

describe("policies", () => {
  it("allows cancellation only before the vendor cutoff", () => {
    const cutoff = atIst("2026-10-12", "18:00");
    expect(canCustomerCancel("PLACED", cutoff, atIst("2026-10-12", "17:59"))).toBe(true);
    expect(canCustomerCancel("PLACED", cutoff, atIst("2026-10-12", "18:00"))).toBe(false);
    expect(canCustomerCancel("BATCHED", cutoff, atIst("2026-10-12", "09:00"))).toBe(false);
  });

  it("refunds unless the customer was unreachable", () => {
    expect(refundPolicyFor("SPOILED")).toEqual({ refundItems: true, refundFees: true });
    expect(refundPolicyFor("UNDELIVERABLE")).toEqual({ refundItems: false, refundFees: false });
  });

  it("maps statuses onto the customer timeline", () => {
    expect(timelinePosition("PENDING_PAYMENT")).toBe(-1);
    expect(timelinePosition("PICKED_UP")).toBe(CUSTOMER_TIMELINE.indexOf("IN_TRANSIT_INTERCITY"));
    expect(timelinePosition("DELIVERED")).toBe(CUSTOMER_TIMELINE.length - 1);
    expect(timelinePosition("CANCELLED")).toBeNull();
  });
});

describe("deriveOrderStatus", () => {
  it("derives the order from its shipments", () => {
    expect(deriveOrderStatus(["PENDING_PAYMENT", "PENDING_PAYMENT"], false)).toBe(
      "PENDING_PAYMENT",
    );
    expect(deriveOrderStatus(["CANCELLED"], false)).toBe("EXPIRED");
    expect(deriveOrderStatus(["CANCELLED", "CANCELLED"], true)).toBe("CANCELLED");
    expect(deriveOrderStatus(["PLACED", "PLACED"], true)).toBe("CONFIRMED");
    expect(deriveOrderStatus(["PLACED", "CANCELLED"], true)).toBe("CONFIRMED");
    expect(deriveOrderStatus(["PLACED", "BATCHED"], true)).toBe("IN_FULFILLMENT");
    expect(deriveOrderStatus(["DELIVERED", "IN_TRANSIT_INTERCITY"], true)).toBe("IN_FULFILLMENT");
    expect(deriveOrderStatus(["DELIVERED", "FAILED"], true)).toBe("COMPLETED");
    expect(deriveOrderStatus(["DELIVERED", "CANCELLED"], true)).toBe("COMPLETED");
  });
});
