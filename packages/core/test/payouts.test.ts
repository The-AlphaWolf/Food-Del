import { schema } from "@food-del/db";
import { DEV_CUSTOMER, DEV_OPS } from "@food-del/db/seed";
import { atIst } from "@food-del/domain";
import type { PayoutRow } from "@food-del/domain/contracts";
import { FakeCarrier, FakePaymentProvider } from "@food-del/integrations";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DomainError } from "../src/errors";
import { createTestCore, type TestCore } from "../src/testing";
import type { Viewer } from "../src/viewer";

let t: TestCore;
let ops: Viewer;
let customer: Viewer;
let kitchenId: string;
let payout: PayoutRow;

const errorOf = (p: Promise<unknown>) => p.then(() => null).catch((e: DomainError) => e);

/** A katli parcel from Old Delhi to Bengaluru, delivered Wed 14 Oct at 13:05 IST. */
async function deliverParcel(): Promise<string> {
  const katli = await t.core.catalog.getItem("kaju-katli");
  kitchenId = katli.vendor.id;
  const placed = await t.core.orders.place(customer, {
    pincode: "560038",
    shipTo: { recipientName: "Ananya Rao", phone: "9876543210", line1: "12, 4th Cross" },
    lines: [{ variantId: katli.variants[0]!.id, quantity: 1 }],
  });
  const { body, signature } = FakePaymentProvider.captureWebhook(
    placed.checkout!.providerOrderId,
    placed.order.totals.grandTotalPaise,
  );
  expect(t.payments.verifyWebhook(body, signature)).toBe(true);
  await t.core.orders.handlePaymentWebhook(t.payments.parseWebhook(body)!);
  const shipmentId = placed.order.shipments[0]!.id;
  t.clock.set(atIst("2026-10-12", "18:05"));
  await t.core.runJob("lock-batches");
  t.clock.set(atIst("2026-10-13", "11:00"));
  const owner = (await t.core.accounts.resolveViewer(
    (
      await t.handle.db
        .select({ userId: schema.memberships.userId })
        .from(schema.memberships)
        .where(eq(schema.memberships.vendorId, kitchenId))
    )[0]!.userId,
  ))!;
  const packed = await t.core.fulfilment.markPacked(owner, shipmentId, {});
  await t.core.tracking.applyCarrierEvents(
    t.carrier.parseWebhook(
      FakeCarrier.event(packed.awbNumber!, "DELIVERED", atIst("2026-10-14", "13:05"), null),
    ),
  );
  t.clock.set(atIst("2026-10-14", "15:00"));
  return shipmentId;
}

beforeAll(async () => {
  t = await createTestCore({ now: atIst("2026-10-12", "11:00") });
  ops = (await t.core.accounts.resolveViewer(DEV_OPS.id))!;
  customer = (await t.core.accounts.resolveViewer(DEV_CUSTOMER.id))!;
  const shipmentId = await deliverParcel();
  payout = (await t.core.payouts.list(ops)).find((p) => p.shipmentId === shipmentId)!;
});

afterAll(async () => {
  await t?.close();
});

describe("ops payouts", () => {
  it("is for operations staff only", async () => {
    expect((await errorOf(t.core.payouts.summary(customer)))?.code).toBe("FORBIDDEN");
  });

  it("explains why a delivered parcel's payout hasn't moved", () => {
    expect(payout).toMatchObject({
      status: "ON_HOLD",
      state: "NEEDS_PAYOUT_ACCOUNT",
      needsAction: true,
      kitchen: { name: "Chandni Chowk Halwai & Sons", city: "Delhi NCR" },
      deliveredAt: atIst("2026-10-14", "13:05").toISOString(),
      releaseAfter: atIst("2026-10-15", "13:05").toISOString(),
    });
    expect(payout.netPaise).toBe(payout.grossPaise - payout.commissionPaise);
  });

  it("sums what's owed and what needs action, per kitchen", async () => {
    const s = await t.core.payouts.summary(ops, 30);
    expect(s.period).toEqual({ from: "2026-09-15", to: "2026-10-14" });
    expect(s.owed).toEqual({ count: 1, netPaise: payout.netPaise });
    expect(s.needsAction).toEqual({ count: 1, netPaise: payout.netPaise });
    expect(s.paid).toEqual({ count: 0, netPaise: 0 });
    expect(s.commissionPaise).toBe(payout.commissionPaise);
    expect(s.kitchens).toEqual([
      expect.objectContaining({
        id: kitchenId,
        accountLinked: false,
        owedPaise: payout.netPaise,
        needsAction: 1,
      }),
    ]);
  });

  it("filters to what needs action, by kitchen and order number", async () => {
    expect(await t.core.payouts.list(ops, { state: "NEEDS_ACTION" })).toHaveLength(1);
    expect(await t.core.payouts.list(ops, { state: "RELEASED" })).toHaveLength(0);
    expect(await t.core.payouts.list(ops, { q: payout.orderNumber.slice(-5) })).toHaveLength(1);
    expect(await t.core.payouts.list(ops, { q: "nobody" })).toHaveLength(0);
    expect(await t.core.payouts.list(ops, { from: "2026-10-15" })).toHaveLength(0);
  });

  it("holds a payout for review so the release job skips it, then resumes", async () => {
    const held = await t.core.payouts.hold(ops, payout.id, { reason: "Box photos under review" });
    expect(held).toMatchObject({ state: "HELD_FOR_REVIEW", heldReason: "Box photos under review" });
    t.clock.set(atIst("2026-10-16", "09:00"));
    await t.core.onboarding.updateKitchen(ops, kitchenId, { payoutAccountRef: "acc_chandni" });
    await t.core.runJob("process-outbox");
    await t.core.runJob("release-payouts");
    // Transferred on hold at the provider, but not released while ops is looking into it.
    expect(await t.core.payouts.get(ops, payout.id)).toMatchObject({
      status: "ON_HOLD",
      state: "HELD_FOR_REVIEW",
      transferId: expect.stringMatching(/^trf_/),
    });
    expect(t.payments.transfers.at(-1)!.released).toBe(false);

    const resumed = await t.core.payouts.resume(ops, payout.id);
    expect(resumed).toMatchObject({ state: "RELEASING", heldReason: null });
    expect(await t.core.runJob("release-payouts")).toMatchObject({ processed: 1 });
    expect(await t.core.payouts.get(ops, payout.id)).toMatchObject({ state: "RELEASED" });
    expect((await errorOf(t.core.payouts.hold(ops, payout.id, { reason: "late" })))?.code).toBe(
      "PAYOUT_SETTLED",
    );
  });

  it("surfaces a parked transfer failure and retries it on demand", async () => {
    const shipmentId = await (async () => {
      t.clock.set(atIst("2026-10-12", "11:00"));
      return deliverParcel();
    })();
    const transfer = t.payments.transferToVendor.bind(t.payments);
    t.payments.transferToVendor = () =>
      Promise.reject(new Error("account acc_chandni is suspended"));
    try {
      await t.core.runJob("process-outbox");
    } finally {
      t.payments.transferToVendor = transfer;
    }
    // Retries back off for hours; jump to the point the outbox gives up and parks it.
    await t.handle.db.execute(
      sql`update outbox set status = 'FAILED' where topic = 'payout.transfer' and status = 'PENDING'`,
    );
    const failed = (await t.core.payouts.list(ops, { state: "TRANSFER_FAILED" })).find(
      (p) => p.shipmentId === shipmentId,
    )!;
    expect(failed).toMatchObject({
      needsAction: true,
      transferId: null,
      transferError: "account acc_chandni is suspended",
    });

    const retried = await t.core.payouts.retry(ops, failed.id);
    expect(retried).toMatchObject({
      state: "IN_CLAIM_WINDOW",
      transferId: expect.stringMatching(/^trf_/),
      transferError: null,
    });
    expect((await errorOf(t.core.payouts.retry(ops, failed.id)))?.code).toBe("NOTHING_TO_RETRY");
  });

  it("exports a statement finance can reconcile", async () => {
    const csv = await t.core.payouts.statementCsv(ops, { from: "2026-10-01", to: "2026-10-31" });
    const [header, ...lines] = csv.trim().split("\r\n");
    expect(header).toBe(
      "payout_id,order_number,kitchen,city,delivered_at,gross_inr,commission_inr,net_inr,status,state,release_after,released_at,reversed_at,provider_transfer_id,provider_reversal_id,held_reason",
    );
    expect(lines).toHaveLength(2);
    const first = lines[0]!;
    expect(first).toContain(payout.orderNumber);
    expect(first).toContain("Chandni Chowk Halwai & Sons");
    expect(first).toContain(`,${(payout.netPaise / 100).toFixed(2)},RELEASED,RELEASED,`);
  });
});
