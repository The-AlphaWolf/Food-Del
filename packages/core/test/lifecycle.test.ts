import { schema } from "@food-del/db";
import { DEV_CUSTOMER, DEV_OPS, devVendorOwner, VENDOR_SEED } from "@food-del/db/seed";
import { atIst } from "@food-del/domain";
import type { PlaceOrderRequest } from "@food-del/domain/contracts";
import { FakeCarrier, FakePaymentProvider } from "@food-del/integrations";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainError } from "../src/errors";
import { createTestCore, type TestCore } from "../src/testing";
import type { Viewer } from "../src/viewer";

const MONDAY_11AM = atIst("2026-10-12", "11:00");

let t: TestCore;
let customer: Viewer;
let ops: Viewer;
let delhiOwner: Viewer;
let kolkataOwner: Viewer;
let katliVariant: string;
let sandeshVariant: string;

const ownerFor = (slug: string) =>
  devVendorOwner(
    VENDOR_SEED.findIndex((v) => v.slug === slug),
    slug,
  ).id;

beforeAll(async () => {
  t = await createTestCore({ now: MONDAY_11AM });
  customer = (await t.core.accounts.resolveViewer(DEV_CUSTOMER.id))!;
  ops = (await t.core.accounts.resolveViewer(DEV_OPS.id))!;
  delhiOwner = (await t.core.accounts.resolveViewer(ownerFor("chandni-chowk-halwai")))!;
  kolkataOwner = (await t.core.accounts.resolveViewer(ownerFor("bagbazar-mishti-ghar")))!;
  katliVariant = (await t.core.catalog.getItem("kaju-katli")).variants[0]!.id;
  sandeshVariant = (await t.core.catalog.getItem("nolen-gur-sandesh")).variants[0]!.id;
});

afterAll(async () => {
  await t?.close();
});

const shipTo = {
  recipientName: "Ananya Rao",
  phone: "9876543210",
  line1: "12, 4th Cross, Indiranagar",
};

function orderRequest(
  lines: PlaceOrderRequest["lines"],
  extra: Partial<PlaceOrderRequest> = {},
): PlaceOrderRequest {
  return { pincode: "560038", shipTo, lines, ...extra };
}

async function capture(providerOrderId: string, amount: number) {
  const { body, signature } = FakePaymentProvider.captureWebhook(providerOrderId, amount);
  expect(t.payments.verifyWebhook(body, signature)).toBe(true);
  return t.core.orders.handlePaymentWebhook(t.payments.parseWebhook(body)!);
}

async function carrierEvent(
  awb: string,
  status: Parameters<typeof FakeCarrier.event>[1],
  at: Date,
  eta?: Date,
) {
  return t.core.tracking.applyCarrierEvents(
    t.carrier.parseWebhook(FakeCarrier.event(awb, status, at, eta ?? null)),
  );
}

async function slot(variantId: string, date: string) {
  const rows = await t.handle.db
    .select()
    .from(schema.inventorySlots)
    .where(eq(schema.inventorySlots.variantId, variantId));
  const found = rows.find((r) => r.dispatchDate === date);
  if (!found) throw new Error(`no slot for ${variantId} on ${date}`);
  return found;
}

describe("catalogue & serviceability", () => {
  it("lists live cities with item counts", async () => {
    const cities = await t.core.catalog.listCities();
    expect(cities.map((c) => c.slug)).toContain("kolkata");
    expect(cities.find((c) => c.slug === "kolkata")!.itemCount).toBe(8);
  });

  it("shows earliest delivery on listing cards, and refuses same-city", async () => {
    const list = await t.core.catalog.listItems({ pincode: "560038" });
    const katli = list.find((i) => i.slug === "kaju-katli")!;
    expect(katli.delivery).toMatchObject({
      available: true,
      promisedDeliveryDate: "2026-10-15",
      mode: "AIR_EXPRESS",
    });
    const mysorePak = list.find((i) => i.slug === "mysore-pak")!;
    expect(mysorePak.delivery).toMatchObject({ available: false, reason: "SAME_CITY" });
  });

  it("explains unserviceable pincodes", async () => {
    expect(await t.core.serviceability.lookupPincode("560038")).toMatchObject({
      serviceable: true,
      city: { slug: "bengaluru" },
    });
    expect(await t.core.serviceability.lookupPincode("302001")).toMatchObject({
      serviceable: false,
      reason: "DESTINATION_NOT_LIVE",
    });
    expect(await t.core.serviceability.lookupPincode("999999")).toMatchObject({
      serviceable: false,
      reason: "UNKNOWN_PINCODE",
    });
  });

  it("builds a delivery calendar from the real lanes", async () => {
    const a = await t.core.serviceability.availability({
      variantId: sandeshVariant,
      pincode: "560038",
      days: 10,
    });
    expect(a.earliest).toMatchObject({
      promisedDeliveryDate: "2026-10-15",
      packagingCode: "PCM_CHILL_48",
      coldChain: true,
    });
    expect(a.days.find((d) => d.date === "2026-10-18")).toMatchObject({
      reason: "NO_DELIVERY_ON_DAY",
    });
  });

  it("knows a two-day sweet can't fly across the country", async () => {
    const kachaGolla = (await t.core.catalog.getItem("kacha-golla", "560038")).delivery;
    expect(kachaGolla).toMatchObject({ available: false, reason: "SHELF_LIFE_EXCEEDED" });
  });
});

describe("quote and checkout", () => {
  it("quotes one parcel per kitchen", async () => {
    const q = await t.core.quotes.quote({
      pincode: "560038",
      lines: [
        { variantId: katliVariant, quantity: 2 },
        { variantId: sandeshVariant, quantity: 1 },
      ],
    });
    expect(q.shipments).toHaveLength(2);
    expect(q.totals.isComplete).toBe(true);
    expect(q.totals.grandTotalPaise).toBe(
      q.totals.itemsTotalPaise +
        q.totals.shippingFeePaise +
        q.totals.packagingFeePaise -
        q.totals.discountPaise,
    );
  });

  it("holds stock for an unpaid order and is idempotent", async () => {
    const before = await slot(katliVariant, "2026-10-13");
    const req = orderRequest([{ variantId: katliVariant, quantity: 2 }]);
    const a = await t.core.orders.place(customer, req, "idem-1");
    const b = await t.core.orders.place(customer, req, "idem-1");
    expect(b.order.id).toBe(a.order.id);
    expect(a.order.status).toBe("PENDING_PAYMENT");
    expect(a.checkout?.kind).toBe("fake");
    expect((await slot(katliVariant, "2026-10-13")).reserved).toBe(before.reserved + 2);
  });

  it("refuses to charge a total the shopper didn't see", async () => {
    const err = await t.core.orders
      .place(
        customer,
        orderRequest([{ variantId: katliVariant, quantity: 1 }], { expectedTotalPaise: 1 }),
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe("PRICE_CHANGED");
  });

  it("rejects invalid recipient phones", async () => {
    const err = await t.core.orders
      .place(customer, {
        ...orderRequest([{ variantId: katliVariant, quantity: 1 }]),
        shipTo: { ...shipTo, phone: "12345" },
      })
      .catch((e: unknown) => e);
    expect((err as DomainError).code).toBe("INVALID_PHONE");
  });
});

describe("full lifecycle: pay → batch → pack → fly → deliver → payout", () => {
  let orderId: string;
  let shipmentId: string;
  let awb: string;

  it("confirms on payment capture and sells the held units", async () => {
    t.clock.set(MONDAY_11AM);
    const placed = await t.core.orders.place(
      customer,
      orderRequest([{ variantId: katliVariant, quantity: 1 }], {
        gift: { message: "Happy Diwali!", senderName: "Ravi" },
      }),
    );
    orderId = placed.order.id;
    shipmentId = placed.order.shipments[0]!.id;
    const before = await slot(katliVariant, "2026-10-13");
    expect(
      await capture(placed.checkout!.providerOrderId, placed.order.totals.grandTotalPaise),
    ).toBe("captured");
    expect(
      await capture(placed.checkout!.providerOrderId, placed.order.totals.grandTotalPaise),
    ).toBe("duplicate");
    const after = await slot(katliVariant, "2026-10-13");
    expect(after.reserved).toBe(before.reserved - 1);
    expect(after.sold).toBe(before.sold + 1);
    const detail = await t.core.orders.get(customer, orderId);
    expect(detail.status).toBe("CONFIRMED");
    expect(detail.shipments[0]!.status).toBe("PLACED");
    expect(detail.canCancel).toBe(true);
  });

  it("sends confirmation, gift heads-up and the vendor's new-order message", async () => {
    await t.core.runJob("process-outbox");
    const templates = t.notifier.sent.map((m) => m.template);
    expect(templates).toEqual(
      expect.arrayContaining(["ORDER_CONFIRMED", "GIFT_HEADS_UP", "VENDOR_NEW_ORDER"]),
    );
    const gift = t.notifier.sent.find((m) => m.template === "GIFT_HEADS_UP")!;
    expect(gift.to).toBe("+919876543210");
    expect(gift.body).toContain("Ravi");
  });

  it("locks the kitchen's batch at cutoff; the customer can no longer cancel", async () => {
    t.clock.set(atIst("2026-10-12", "18:01"));
    expect((await t.core.runJob("lock-batches")).processed).toBeGreaterThanOrEqual(1);
    const detail = await t.core.orders.get(customer, orderId);
    expect(detail.shipments[0]!.status).toBe("BATCHED");
    expect(detail.status).toBe("IN_FULFILLMENT");
    const err = await t.core.orders.cancel(customer, orderId).catch((e: unknown) => e);
    expect((err as DomainError).code).toBe("CANNOT_CANCEL");
  });

  it("gives the kitchen a production sheet and packing list", async () => {
    const vendorId = (await t.core.orders.get(customer, orderId)).shipments[0]!.vendor.id;
    const day = await t.core.fulfilment.day(delhiOwner, vendorId, "2026-10-13");
    expect(day.isLocked).toBe(true);
    expect(
      day.production.find((p) => p.itemName === "Kaju Katli")!.quantity,
    ).toBeGreaterThanOrEqual(1);
    expect(day.shipments.find((s) => s.id === shipmentId)).toMatchObject({
      canPack: true,
      recipientName: "Ananya",
    });
  });

  it("stops other kitchens from touching the parcel", async () => {
    const err = await t.core.fulfilment
      .markPacked(kolkataOwner, shipmentId, {})
      .catch((e: unknown) => e);
    expect((err as DomainError).code).toBe("FORBIDDEN");
  });

  it("packs, recomputes freshness from real prep time, and books the courier", async () => {
    t.clock.set(atIst("2026-10-13", "11:45"));
    const packed = await t.core.fulfilment.markPacked(delhiOwner, shipmentId, {
      preparedAt: atIst("2026-10-13", "05:00").toISOString(),
    });
    expect(packed.status).toBe("PACKED_COLD_CHAIN");
    // Booked in the same request, so the kitchen can print the label straight away.
    expect(packed.awbNumber).toMatch(/^FD\d+/);
    expect(packed.labelUrl).toContain(packed.awbNumber);
    await t.core.runJob("process-outbox");
    const detail = await t.core.orders.get(customer, orderId);
    awb = detail.shipments[0]!.awbNumber!;
    expect(awb).toBe(packed.awbNumber);
    // Katli: 240 h shelf life − 72 h residual from 05:00 Tue = 05:00 Fri.
    expect(detail.shipments[0]!.deliverByAt).toBe(atIst("2026-10-20", "05:00").toISOString());
    expect(t.carrier.pickups.length).toBeGreaterThan(0);
  });

  it("follows the carrier, ignoring duplicates and stale scans", async () => {
    expect(await carrierEvent(awb, "PICKED_UP", atIst("2026-10-13", "15:30"))).toEqual(["applied"]);
    expect(await carrierEvent(awb, "PICKED_UP", atIst("2026-10-13", "15:30"))).toEqual(["stale"]);
    expect(await carrierEvent(awb, "AT_DESTINATION_HUB", atIst("2026-10-14", "06:00"))).toEqual([
      "applied",
    ]);
    expect(await carrierEvent(awb, "IN_TRANSIT_INTERCITY", atIst("2026-10-13", "22:00"))).toEqual([
      "stale",
    ]);
    expect(await carrierEvent(awb, "OUT_FOR_LOCAL_DELIVERY", atIst("2026-10-14", "09:00"))).toEqual(
      ["applied"],
    );
    t.clock.set(atIst("2026-10-14", "13:10"));
    expect(await carrierEvent(awb, "DELIVERED", atIst("2026-10-14", "13:05"))).toEqual(["applied"]);
    const detail = await t.core.orders.get(customer, orderId);
    expect(detail.status).toBe("COMPLETED");
    expect(detail.shipments[0]!.timeline.map((e) => e.status)).toEqual([
      "PENDING_PAYMENT",
      "PLACED",
      "BATCHED",
      "PACKED_COLD_CHAIN",
      "PICKED_UP",
      "AT_DESTINATION_HUB",
      "OUT_FOR_LOCAL_DELIVERY",
      "DELIVERED",
    ]);
  });

  it("holds the vendor payout until the claim window closes", async () => {
    const [payout] = await t.handle.db
      .select()
      .from(schema.vendorPayouts)
      .where(eq(schema.vendorPayouts.shipmentId, shipmentId));
    expect(payout).toMatchObject({ status: "ON_HOLD" });
    expect(payout!.netPaise).toBe(payout!.grossPaise - payout!.commissionPaise);
    expect(await t.core.runJob("release-payouts")).toMatchObject({ processed: 0 });
  });

  it("never marks a payout paid without a transfer, and pays once an account is linked", async () => {
    t.clock.advanceHours(25);
    // The kitchen has no payout account: the window has closed but no money can move.
    expect(await t.core.runJob("release-payouts")).toMatchObject({ processed: 0 });
    const stuck = (await t.core.payouts.list(ops, { state: "NEEDS_PAYOUT_ACCOUNT" })).find(
      (p) => p.shipmentId === shipmentId,
    );
    expect(stuck).toMatchObject({ status: "ON_HOLD", needsAction: true, transferId: null });

    const kitchenId = (await t.core.catalog.getItem("kaju-katli")).vendor.id;
    await t.core.onboarding.updateKitchen(ops, kitchenId, { payoutAccountRef: "acc_delhi_halwai" });
    await t.core.runJob("process-outbox");
    const transfer = t.payments.transfers.find((x) => x.accountRef === "acc_delhi_halwai");
    expect(transfer).toMatchObject({ amountPaise: stuck!.netPaise, released: false });

    expect(await t.core.runJob("release-payouts")).toMatchObject({ processed: 1 });
    expect(transfer!.released).toBe(true);
    expect(await t.core.payouts.get(ops, stuck!.id)).toMatchObject({
      status: "RELEASED",
      state: "RELEASED",
      transferId: expect.stringMatching(/^trf_/),
    });
  });
});

describe("cancellation, expiry and late payment", () => {
  it("cancels before cutoff and refunds through the provider", async () => {
    t.clock.set(atIst("2026-10-14", "09:00"));
    const placed = await t.core.orders.place(
      customer,
      orderRequest([{ variantId: katliVariant, quantity: 1 }]),
    );
    await capture(placed.checkout!.providerOrderId, placed.order.totals.grandTotalPaise);
    const cancelled = await t.core.orders.cancel(customer, placed.order.id);
    expect(cancelled.status).toBe("CANCELLED");
    const refundsBefore = t.payments.refunds.length;
    await t.core.runJob("process-outbox");
    expect(t.payments.refunds.length).toBe(refundsBefore + 1);
    expect(t.payments.refunds.at(-1)!.amountPaise).toBe(placed.order.totals.grandTotalPaise);
    const detail = await t.core.orders.get(customer, placed.order.id);
    expect(detail.payment).toMatchObject({
      status: "REFUNDED",
      refundedPaise: placed.order.totals.grandTotalPaise,
    });
  });

  it("expires unpaid holds and refunds payments that arrive too late", async () => {
    t.clock.set(atIst("2026-10-14", "10:00"));
    const placed = await t.core.orders.place(
      customer,
      orderRequest([{ variantId: sandeshVariant, quantity: 1 }]),
    );
    const dispatch = placed.order.shipments[0]!.dispatchDate;
    const held = await slot(sandeshVariant, dispatch);
    t.clock.advanceHours(0.5);
    // Also expires the abandoned checkout from the idempotency test.
    expect((await t.core.runJob("expire-holds")).processed).toBeGreaterThanOrEqual(1);
    expect((await slot(sandeshVariant, dispatch)).reserved).toBe(held.reserved - 1);
    expect((await t.core.orders.get(customer, placed.order.id)).status).toBe("EXPIRED");
    expect(
      await capture(placed.checkout!.providerOrderId, placed.order.totals.grandTotalPaise),
    ).toBe("refunded");
  });
});

describe("kitchen shortfall, risk and claims", () => {
  it("fails and refunds a parcel the kitchen can't make", async () => {
    t.clock.set(atIst("2026-10-14", "11:00"));
    const placed = await t.core.orders.place(
      customer,
      orderRequest([{ variantId: sandeshVariant, quantity: 1 }]),
    );
    await capture(placed.checkout!.providerOrderId, placed.order.totals.grandTotalPaise);
    t.clock.set(atIst("2026-10-14", "18:05"));
    await t.core.runJob("lock-batches");
    const s = await t.core.fulfilment.reportShortfall(
      kolkataOwner,
      placed.order.shipments[0]!.id,
      "Chhena split this morning",
    );
    expect(s.status).toBe("FAILED");
    const refunds = await t.handle.db
      .select()
      .from(schema.refunds)
      .where(eq(schema.refunds.orderId, placed.order.id));
    expect(refunds[0]!.amountPaise).toBe(placed.order.totals.grandTotalPaise);
  });

  it("flags parcels whose courier ETA passes the spoilage deadline", async () => {
    t.clock.set(atIst("2026-10-15", "09:00"));
    const placed = await t.core.orders.place(
      customer,
      orderRequest([{ variantId: sandeshVariant, quantity: 1 }]),
    );
    await capture(placed.checkout!.providerOrderId, placed.order.totals.grandTotalPaise);
    const parcel = placed.order.shipments[0]!;
    const id = parcel.id;
    // A Friday dispatch would sit over Sunday and spoil, so the engine chose Saturday.
    expect(parcel.dispatchDate).toBe("2026-10-17");
    t.clock.set(new Date(new Date(parcel.orderCutoffAt).getTime() + 5 * 60_000));
    await t.core.runJob("lock-batches");
    t.clock.set(atIst(parcel.dispatchDate, "11:00"));
    await t.core.fulfilment.markPacked(kolkataOwner, id, {});
    await t.core.runJob("process-outbox");
    const awb = (await t.core.orders.get(customer, placed.order.id)).shipments[0]!.awbNumber!;
    const deliverBy = new Date(
      (await t.core.orders.get(customer, placed.order.id)).shipments[0]!.deliverByAt,
    );
    await carrierEvent(
      awb,
      "PICKED_UP",
      atIst(parcel.dispatchDate, "15:00"),
      new Date(deliverBy.getTime() + 6 * 3_600_000),
    );
    const overview = await t.core.ops.overview(ops);
    expect(overview.exceptions.find((e) => e.id === id)?.isAtRisk).toBe(true);
    await t.core.runJob("process-outbox");
    expect(
      t.notifier.sent.some((m) => m.template === "OPS_AT_RISK" && m.to === "+919900000002"),
    ).toBe(true);
  });

  it("refunds an approved claim and claws back the vendor payout", async () => {
    t.clock.set(atIst("2026-10-19", "09:00"));
    const placed = await t.core.orders.place(
      customer,
      orderRequest([{ variantId: katliVariant, quantity: 1 }]),
    );
    await capture(placed.checkout!.providerOrderId, placed.order.totals.grandTotalPaise);
    const id = placed.order.shipments[0]!.id;
    t.clock.set(atIst("2026-10-19", "18:05"));
    await t.core.runJob("lock-batches");
    t.clock.set(atIst("2026-10-20", "11:00"));
    await t.core.fulfilment.markPacked(delhiOwner, id, {});
    await t.core.runJob("process-outbox");
    const awb = (await t.core.orders.get(customer, placed.order.id)).shipments[0]!.awbNumber!;
    await carrierEvent(awb, "DELIVERED", atIst("2026-10-21", "12:00"));
    t.clock.set(atIst("2026-10-21", "14:00"));
    // The kitchen's share is already routed to its account, on hold.
    await t.core.runJob("process-outbox");
    const transfersBefore = t.payments.transfers.length;
    expect(t.payments.transfers.at(-1)).toMatchObject({ released: false, reversed: false });

    const claim = await t.core.claims.create(customer, id, {
      kind: "DAMAGED",
      description: "Box crushed, katli broken into pieces",
    });
    const resolved = await t.core.claims.resolve(ops, claim.id, {
      decision: "APPROVED",
      resolution: "REFUND",
    });
    expect(resolved.refundPaise).toBe(placed.order.totals.grandTotalPaise);
    const [payout] = await t.handle.db
      .select()
      .from(schema.vendorPayouts)
      .where(eq(schema.vendorPayouts.shipmentId, id));
    expect(payout!.status).toBe("REVERSED");
    expect(payout!.reversedAt).not.toBeNull();
    expect((await t.core.payouts.get(ops, payout!.id)).state).toBe("REVERSAL_PENDING");

    // …and taken back from the kitchen's account.
    await t.core.runJob("process-outbox");
    expect(t.payments.transfers).toHaveLength(transfersBefore);
    expect(t.payments.transfers.at(-1)!.reversed).toBe(true);
    expect(await t.core.payouts.get(ops, payout!.id)).toMatchObject({
      state: "CLAWED_BACK",
      reversalId: expect.stringMatching(/^rvrsl_/),
    });
  });

  it("still packs when the courier is down, and books on the outbox retry", async () => {
    t.clock.set(atIst("2026-10-20", "09:00"));
    const placed = await t.core.orders.place(
      customer,
      orderRequest([{ variantId: katliVariant, quantity: 1 }]),
    );
    await capture(placed.checkout!.providerOrderId, placed.order.totals.grandTotalPaise);
    const parcel = placed.order.shipments[0]!;
    t.clock.set(new Date(new Date(parcel.orderCutoffAt).getTime() + 5 * 60_000));
    await t.core.runJob("lock-batches");
    t.clock.set(atIst(parcel.dispatchDate, "11:00"));
    const book = t.carrier.book.bind(t.carrier);
    t.carrier.book = () => Promise.reject(new Error("courier API unavailable"));
    try {
      const packed = await t.core.fulfilment.markPacked(delhiOwner, parcel.id, {});
      expect(packed).toMatchObject({ status: "PACKED_COLD_CHAIN", awbNumber: null });
    } finally {
      t.carrier.book = book;
    }
    // The failed attempt backs off for two minutes before the cron tick retries it.
    t.clock.set(atIst(parcel.dispatchDate, "11:03"));
    await t.core.runJob("process-outbox");
    const detail = await t.core.orders.get(customer, placed.order.id);
    expect(detail.shipments[0]!.awbNumber).toMatch(/^FD\d+/);
  });
});

describe("vendor inventory", () => {
  it("won't cut a cap below what's already sold", async () => {
    const vendorId = (await t.core.catalog.getItem("kaju-katli")).vendor.id;
    const s = await slot(katliVariant, "2026-10-13");
    const err = await t.core.fulfilment
      .updateInventory(delhiOwner, vendorId, {
        cells: [{ variantId: katliVariant, date: "2026-10-13", capacity: s.sold + s.reserved - 1 }],
      })
      .catch((e: unknown) => e);
    expect((err as DomainError).code).toBe("CAPACITY_BELOW_SOLD");
    const grid = await t.core.fulfilment.updateInventory(delhiOwner, vendorId, {
      cells: [{ variantId: katliVariant, date: "2026-10-30", capacity: 99 }],
    });
    expect(grid.rows.length).toBeGreaterThan(0);
  });
});
