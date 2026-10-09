import { type Executor, schema } from "@food-del/db";
import { and, asc, eq, lte, type SQL, sql } from "drizzle-orm";
import type { CoreDeps } from "../deps";
import type { FulfilmentService } from "./fulfilment";
import { type NotificationService, TEMPLATES, type Template } from "./notifications";
import type { OutboxMessage } from "./shipments";
import type { TrackingService } from "./tracking";

const { outbox, payments, refunds } = schema;

const MAX_ATTEMPTS = 8;

/**
 * Executes side effects recorded in the outbox. Each message runs in a savepoint: if the handler
 * fails, its database writes roll back and the message is retried with exponential backoff, then
 * parked as FAILED for ops after `MAX_ATTEMPTS`.
 */
export class OutboxProcessor {
  constructor(
    private readonly deps: CoreDeps,
    private readonly services: {
      fulfilment: FulfilmentService;
      tracking: TrackingService;
      notifications: NotificationService;
    },
  ) {}

  async process(limit = 50): Promise<number> {
    let processed = 0;
    for (; processed < limit; processed++) {
      const handled = await this.processOne();
      if (!handled) break;
    }
    return processed;
  }

  /**
   * Run a parcel's freshly enqueued `topic` messages now rather than on the next cron tick, e.g.
   * book the courier the moment the kitchen packs so the label can be printed straight away.
   * Only untried messages are taken, so one in backoff keeps its schedule; a failure here leaves
   * the message on the normal retry path.
   */
  async processFor(
    topic: OutboxMessage["topic"],
    match: { shipmentId: string } | { payoutId: string },
  ): Promise<number> {
    let processed = 0;
    const filter = and(
      eq(outbox.topic, topic),
      eq(outbox.attempts, 0),
      ...Object.entries(match).map(([key, value]) => sql`${outbox.payload}->>${key} = ${value}`),
    );
    while (await this.processOne(filter)) processed++;
    return processed;
  }

  private async processOne(filter?: SQL): Promise<boolean> {
    const now = this.deps.clock();
    return this.deps.db.transaction(async (tx) => {
      const [msg] = await tx
        .select()
        .from(outbox)
        .where(
          filter
            ? and(eq(outbox.status, "PENDING"), filter)
            : and(eq(outbox.status, "PENDING"), lte(outbox.availableAt, now)),
        )
        .orderBy(asc(outbox.id))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!msg) return false;
      try {
        await tx.transaction((sp) =>
          this.handle(sp, { topic: msg.topic, payload: msg.payload } as OutboxMessage),
        );
        await tx
          .update(outbox)
          .set({ status: "DONE", attempts: msg.attempts + 1, processedAt: now, lastError: null })
          .where(eq(outbox.id, msg.id));
      } catch (e) {
        const attempts = msg.attempts + 1;
        const error = e instanceof Error ? e.message : String(e);
        this.deps.logger.warn("outbox handler failed", {
          id: msg.id,
          topic: msg.topic,
          attempts,
          error,
        });
        await tx
          .update(outbox)
          .set({
            status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
            attempts,
            lastError: error.slice(0, 1000),
            availableAt: new Date(now.getTime() + Math.min(2 ** attempts, 120) * 60_000),
          })
          .where(eq(outbox.id, msg.id));
      }
      return true;
    });
  }

  private async handle(tx: Executor, msg: OutboxMessage): Promise<void> {
    switch (msg.topic) {
      case "notify": {
        if (!(TEMPLATES as readonly string[]).includes(msg.payload.template)) {
          throw new Error(`unknown template ${msg.payload.template}`);
        }
        await this.services.notifications.send(
          tx,
          msg.payload.template as Template,
          msg.payload.orderId,
          msg.payload.shipmentId,
          msg.payload.extra ?? {},
        );
        return;
      }
      case "carrier.book":
        return this.services.fulfilment.bookCarrier(tx, msg.payload.shipmentId);
      case "payment.refund":
        return this.refund(tx, msg.payload.refundId);
      case "payout.transfer":
        return this.services.tracking.transferPayout(tx, msg.payload.payoutId);
      case "payout.reverse":
        return this.services.tracking.reversePayout(tx, msg.payload.payoutId);
    }
  }

  private async refund(tx: Executor, refundId: string): Promise<void> {
    const [refund] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for("update");
    if (refund?.status !== "PENDING" || refund.providerRefundId) return;
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, refund.paymentId))
      .for("update");
    if (!payment?.providerPaymentId) throw new Error("payment has no provider payment id yet");
    const result = await this.deps.payments.refund({
      providerPaymentId: payment.providerPaymentId,
      amountPaise: refund.amountPaise,
      notes: { refundId: refund.id, reason: refund.reason },
    });
    const now = this.deps.clock();
    await tx
      .update(refunds)
      .set({
        providerRefundId: result.providerRefundId,
        status: result.status,
        processedAt: result.status === "PROCESSED" ? now : null,
      })
      .where(eq(refunds.id, refund.id));
    const refunded = payment.refundedPaise + refund.amountPaise;
    await tx
      .update(payments)
      .set({
        refundedPaise: refunded,
        status: refunded >= payment.amountPaise ? "REFUNDED" : "PARTIALLY_REFUNDED",
      })
      .where(eq(payments.id, payment.id));
  }
}
