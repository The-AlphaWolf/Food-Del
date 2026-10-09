import { type Executor, schema } from "@food-del/db";
import {
  type Actor,
  assertTransition,
  deriveOrderStatus,
  type FailureReason,
  type ShipmentStatus,
} from "@food-del/domain";
import { asc, eq } from "drizzle-orm";
import { conflict, notFound } from "../errors";

const { orders, outbox, shipmentEvents, shipments } = schema;

export type ShipmentRow = typeof shipments.$inferSelect;

export interface TransitionArgs {
  shipmentId: string;
  to: ShipmentStatus;
  actor: Actor;
  actorId?: string | null;
  failureReason?: FailureReason | null;
  note?: string | null;
  externalEventId?: string | null;
  carrierPayload?: unknown;
  occurredAt?: Date;
  /** Extra columns to set alongside the status change. */
  patch?: Partial<Omit<ShipmentRow, "id" | "status" | "version" | "orderId">>;
  /** Only proceed if the shipment is currently in one of these states. */
  expectFrom?: readonly ShipmentStatus[];
  now: Date;
}

/**
 * The one way a shipment changes state: validates against the state machine, bumps the
 * optimistic-lock version, appends to the timeline and re-derives the order status — all in the
 * caller's transaction.
 */
export async function transitionShipment(
  tx: Executor,
  args: TransitionArgs,
): Promise<{ before: ShipmentRow; after: ShipmentRow }> {
  const [before] = await tx
    .select()
    .from(shipments)
    .where(eq(shipments.id, args.shipmentId))
    .for("update");
  if (!before) throw notFound("Shipment");
  if (args.expectFrom && !args.expectFrom.includes(before.status)) {
    throw conflict(
      "INVALID_STATE",
      `This parcel is ${before.status.toLowerCase().replace(/_/g, " ")}.`,
      {
        status: before.status,
      },
    );
  }
  assertTransition({
    from: before.status,
    to: args.to,
    actor: args.actor,
    failureReason: args.failureReason ?? null,
  });

  const [after] = await tx
    .update(shipments)
    .set({
      ...args.patch,
      status: args.to,
      failureReason: args.to === "FAILED" ? (args.failureReason ?? null) : null,
      version: before.version + 1,
      updatedAt: args.now,
      ...(args.to === "CANCELLED" ? { cancelledAt: args.now } : {}),
    })
    .where(eq(shipments.id, before.id))
    .returning();

  await tx.insert(shipmentEvents).values({
    shipmentId: before.id,
    fromStatus: before.status,
    toStatus: args.to,
    actor: args.actor,
    actorId: args.actorId ?? null,
    externalEventId: args.externalEventId ?? null,
    note: args.note ?? null,
    carrierPayload: args.carrierPayload ?? null,
    occurredAt: args.occurredAt ?? args.now,
  });

  await refreshOrderStatus(tx, before.orderId, args.now);
  return { before, after: after! };
}

/** Recompute an order's status from its shipments. */
export async function refreshOrderStatus(tx: Executor, orderId: string, now: Date): Promise<void> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return;
  const statuses = await tx
    .select({ status: shipments.status })
    .from(shipments)
    .where(eq(shipments.orderId, orderId))
    .orderBy(asc(shipments.sequence));
  const status = deriveOrderStatus(
    statuses.map((s) => s.status),
    order.placedAt !== null,
  );
  if (status !== order.status) {
    await tx.update(orders).set({ status, updatedAt: now }).where(eq(orders.id, orderId));
  }
}

// ─── Outbox ────────────────────────────────────────────────────────────────────────────────────

export type OutboxMessage =
  | {
      topic: "notify";
      payload: {
        template: string;
        orderId: string;
        shipmentId?: string;
        extra?: Record<string, string>;
      };
    }
  | { topic: "carrier.book"; payload: { shipmentId: string } }
  | { topic: "payment.refund"; payload: { refundId: string } }
  | { topic: "payout.transfer"; payload: { payoutId: string } }
  | { topic: "payout.reverse"; payload: { payoutId: string } };

/** Record a side effect to run after this transaction commits. */
export async function enqueue(
  tx: Executor,
  message: OutboxMessage,
  availableAt?: Date,
): Promise<void> {
  await tx.insert(outbox).values({
    topic: message.topic,
    payload: message.payload,
    ...(availableAt ? { availableAt } : {}),
  });
}
