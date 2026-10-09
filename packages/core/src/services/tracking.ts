import { type Executor, isUniqueViolation, schema } from "@food-del/db";
import { addHours, applyBps, decideCarrierEvent, IN_FLIGHT_STATUSES } from "@food-del/domain";
import type { CarrierEvent } from "@food-del/integrations";
import { and, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { CoreDeps } from "../deps";
import { enqueue, transitionShipment } from "./shipments";

const { claims, outbox, payments, shipments, vendorPayouts, vendors } = schema;

/**
 * Queue the provider transfer for a payout unless one is already waiting or parked as failed
 * (a failed one is retried deliberately by ops, not re-queued on every run).
 */
export async function queueTransfer(tx: Executor, payoutId: string): Promise<boolean> {
  const [queued] = await tx
    .select({ id: outbox.id })
    .from(outbox)
    .where(
      and(
        eq(outbox.topic, "payout.transfer"),
        inArray(outbox.status, ["PENDING", "FAILED"]),
        sql`${outbox.payload}->>'payoutId' = ${payoutId}`,
      ),
    )
    .limit(1);
  if (queued) return false;
  await enqueue(tx, { topic: "payout.transfer", payload: { payoutId } });
  return true;
}

/** A kitchen just linked its payout account: transfer everything it's owed but not yet sent. */
export async function queuePendingTransfers(tx: Executor, vendorId: string): Promise<number> {
  const pending = await tx
    .select({ id: vendorPayouts.id })
    .from(vendorPayouts)
    .where(
      and(
        eq(vendorPayouts.vendorId, vendorId),
        eq(vendorPayouts.status, "ON_HOLD"),
        isNull(vendorPayouts.providerTransferId),
      ),
    );
  let queued = 0;
  for (const p of pending) if (await queueTransfer(tx, p.id)) queued++;
  return queued;
}

export type CarrierEventOutcome =
  | "applied"
  | "stale"
  | "invalid"
  | "unknown-awb"
  | "duplicate"
  | "info";

const WATCHED = [...IN_FLIGHT_STATUSES, "PACKED_COLD_CHAIN" as const];

export class TrackingService {
  constructor(private readonly deps: CoreDeps) {}

  /** Apply normalised carrier events (webhooks or polling). Safe to replay. */
  async applyCarrierEvents(events: CarrierEvent[]): Promise<CarrierEventOutcome[]> {
    const out: CarrierEventOutcome[] = [];
    for (const e of events) out.push(await this.applyOne(e));
    return out;
  }

  private async applyOne(e: CarrierEvent): Promise<CarrierEventOutcome> {
    const now = this.deps.clock();
    try {
      return await this.deps.db.transaction(async (tx) => {
        const [s] = await tx
          .select()
          .from(shipments)
          .where(eq(shipments.awbNumber, e.awbNumber))
          .for("update");
        if (!s) {
          this.deps.logger.warn("carrier event for unknown AWB", {
            awb: e.awbNumber,
            status: e.rawStatus,
          });
          return "unknown-awb";
        }

        const etaPatch = e.etaAt ? { latestEtaAt: e.etaAt } : {};
        const atRisk =
          Boolean(e.lost) || (e.etaAt ? e.etaAt.getTime() > s.deliverByAt.getTime() : s.isAtRisk);

        if (!e.status) {
          await tx
            .update(shipments)
            .set({ ...etaPatch, isAtRisk: atRisk, updatedAt: now })
            .where(eq(shipments.id, s.id));
          if (atRisk && !s.isAtRisk) await this.alertAtRisk(tx, s.orderId, s.id);
          return "info";
        }

        const decision = decideCarrierEvent(s.status, e.status);
        if (decision !== "APPLY") {
          if (decision === "IGNORE_INVALID") {
            this.deps.logger.warn("carrier event out of sequence", {
              shipmentId: s.id,
              from: s.status,
              to: e.status,
            });
          }
          return decision === "IGNORE_STALE" ? "stale" : "invalid";
        }

        const timePatch =
          e.status === "PICKED_UP"
            ? { pickedUpAt: e.occurredAt }
            : e.status === "DELIVERED"
              ? { deliveredAt: e.occurredAt, isAtRisk: false }
              : {};
        await transitionShipment(tx, {
          shipmentId: s.id,
          to: e.status,
          actor: "CARRIER",
          externalEventId: e.externalEventId,
          carrierPayload: { rawStatus: e.rawStatus, location: e.location },
          occurredAt: e.occurredAt,
          note: e.location ? `${e.rawStatus} · ${e.location}` : e.rawStatus,
          patch: {
            ...etaPatch,
            ...(e.status === "DELIVERED" ? {} : { isAtRisk: atRisk }),
            ...timePatch,
          },
          now,
        });

        if (e.status === "DELIVERED") await this.createPayout(tx, s.id, e.occurredAt);

        const template =
          e.status === "OUT_FOR_LOCAL_DELIVERY"
            ? "OUT_FOR_DELIVERY"
            : e.status === "DELIVERY_ATTEMPT_FAILED"
              ? "DELIVERY_ATTEMPT_FAILED"
              : e.status === "DELIVERED"
                ? "DELIVERED"
                : e.status === "IN_TRANSIT_INTERCITY" && s.status !== "IN_TRANSIT_INTERCITY"
                  ? "IN_TRANSIT"
                  : null;
        if (template) {
          await enqueue(tx, {
            topic: "notify",
            payload: { template, orderId: s.orderId, shipmentId: s.id },
          });
        }
        if (atRisk && !s.isAtRisk && e.status !== "DELIVERED")
          await this.alertAtRisk(tx, s.orderId, s.id);
        return "applied";
      });
    } catch (err) {
      if (isUniqueViolation(err, "shipment_events_external")) return "duplicate";
      throw err;
    }
  }

  private async alertAtRisk(
    tx: Parameters<typeof enqueue>[0],
    orderId: string,
    shipmentId: string,
  ) {
    await enqueue(tx, {
      topic: "notify",
      payload: { template: "OPS_AT_RISK", orderId, shipmentId },
    });
  }

  /** Vendor's share, held until the claim window closes. */
  private async createPayout(
    tx: Parameters<typeof enqueue>[0],
    shipmentId: string,
    deliveredAt: Date,
  ) {
    const [row] = await tx
      .select({ s: shipments, v: vendors })
      .from(shipments)
      .innerJoin(vendors, eq(vendors.id, shipments.vendorId))
      .where(eq(shipments.id, shipmentId));
    if (!row) return;
    const gross = row.s.itemsTotalPaise;
    const commission = applyBps(gross, row.v.commissionBps);
    const [payout] = await tx
      .insert(vendorPayouts)
      .values({
        vendorId: row.v.id,
        shipmentId,
        grossPaise: gross,
        commissionPaise: commission,
        netPaise: gross - commission,
        releaseAfter: addHours(deliveredAt, this.deps.config.claimWindowHours),
      })
      .onConflictDoNothing()
      .returning({ id: vendorPayouts.id });
    if (payout && row.v.payoutAccountRef) await queueTransfer(tx, payout.id);
  }

  /** Route a vendor's held share through the payment provider (outbox handler). */
  async transferPayout(tx: Parameters<typeof enqueue>[0], payoutId: string): Promise<void> {
    const [row] = await tx
      .select({ p: vendorPayouts, v: vendors, s: shipments })
      .from(vendorPayouts)
      .innerJoin(vendors, eq(vendors.id, vendorPayouts.vendorId))
      .innerJoin(shipments, eq(shipments.id, vendorPayouts.shipmentId))
      .where(eq(vendorPayouts.id, payoutId));
    if (row?.p.status !== "ON_HOLD" || row.p.providerTransferId || !row.v.payoutAccountRef) return;
    const [payment] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.orderId, row.s.orderId),
          inArray(payments.status, ["CAPTURED", "PARTIALLY_REFUNDED"]),
        ),
      );
    // Retried with backoff, then parked as failed for ops: the payout stays unpaid, never "released".
    if (!payment?.providerPaymentId) throw new Error("no captured payment to transfer from");
    const transferId = await this.deps.payments.transferToVendor({
      providerPaymentId: payment.providerPaymentId,
      accountRef: row.v.payoutAccountRef,
      amountPaise: row.p.netPaise,
    });
    await tx
      .update(vendorPayouts)
      .set({ providerTransferId: transferId })
      .where(eq(vendorPayouts.id, payoutId));
  }

  /**
   * Release payouts whose claim window has closed, with no open claim and no review hold. Money
   * only moves through a provider transfer, so a payout without one is never marked paid: its
   * transfer is queued (when the kitchen has a payout account) and it's released on a later run.
   */
  async releasePayouts(limit = 200): Promise<number> {
    const now = this.deps.clock();
    const due = await this.deps.db
      .select({ p: vendorPayouts, accountRef: vendors.payoutAccountRef })
      .from(vendorPayouts)
      .innerJoin(vendors, eq(vendors.id, vendorPayouts.vendorId))
      .where(
        and(
          eq(vendorPayouts.status, "ON_HOLD"),
          lte(vendorPayouts.releaseAfter, now),
          isNull(vendorPayouts.heldReason),
          sql`not exists (select 1 from ${claims} c where c.shipment_id = ${vendorPayouts.shipmentId} and c.status = 'OPEN')`,
        ),
      )
      .limit(limit);
    let released = 0;
    for (const { p, accountRef } of due) {
      if (!p.providerTransferId) {
        if (accountRef) await queueTransfer(this.deps.db, p.id);
        continue;
      }
      await this.deps.payments.releaseTransfer(p.providerTransferId);
      const done = await this.deps.db
        .update(vendorPayouts)
        .set({ status: "RELEASED", releasedAt: now })
        .where(and(eq(vendorPayouts.id, p.id), eq(vendorPayouts.status, "ON_HOLD")))
        .returning({ id: vendorPayouts.id });
      released += done.length;
    }
    return released;
  }

  /** Take back a clawed-back payout's transfer from the kitchen's account (outbox handler). */
  async reversePayout(tx: Executor, payoutId: string): Promise<void> {
    const [p] = await tx
      .select()
      .from(vendorPayouts)
      .where(
        and(
          eq(vendorPayouts.id, payoutId),
          eq(vendorPayouts.status, "REVERSED"),
          isNotNull(vendorPayouts.providerTransferId),
          isNull(vendorPayouts.providerReversalId),
        ),
      )
      .for("update");
    if (!p) return;
    const reversalId = await this.deps.payments.reverseTransfer(p.providerTransferId!, p.netPaise);
    await tx
      .update(vendorPayouts)
      .set({ providerReversalId: reversalId })
      .where(eq(vendorPayouts.id, payoutId));
  }

  /**
   * Flag parcels whose latest ETA (or the clock) has passed their spoilage deadline so ops can
   * intervene — call the courier, warn the customer, or refund and reship.
   */
  async monitorAtRisk(): Promise<number> {
    const now = this.deps.clock();
    const flagged = await this.deps.db
      .update(shipments)
      .set({ isAtRisk: true, updatedAt: now })
      .where(
        and(
          inArray(shipments.status, WATCHED),
          eq(shipments.isAtRisk, false),
          sql`(coalesce(${shipments.latestEtaAt}, ${shipments.etaP90At}) > ${shipments.deliverByAt} or ${shipments.deliverByAt} < ${now.toISOString()}::timestamptz)`,
        ),
      )
      .returning({ id: shipments.id, orderId: shipments.orderId });
    for (const f of flagged) {
      await enqueue(this.deps.db, {
        topic: "notify",
        payload: { template: "OPS_AT_RISK", orderId: f.orderId, shipmentId: f.id },
      });
    }
    return flagged.length;
  }
}
