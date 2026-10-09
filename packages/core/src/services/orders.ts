import {
  convertReservation,
  type Executor,
  isUniqueViolation,
  releaseReservation,
  releaseSold,
  reserveUnits,
  schema,
} from "@food-del/db";
import { addHours, canCustomerCancel, lineTotal, normaliseIndianMobile } from "@food-del/domain";
import type {
  OrderDetail,
  OrderSummary,
  PlaceOrderRequest,
  PlaceOrderResponse,
} from "@food-del/domain/contracts";
import type { PaymentWebhookEvent } from "@food-del/integrations";
import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { CoreDeps } from "../deps";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { newOrderNumber } from "../mappers";
import { isStaff, requireViewer, type Viewer } from "../viewer";
import { listOrderSummaries, loadOrderDetail } from "./order-views";
import { planCart } from "./quotes";
import { enqueue, refreshOrderStatus, transitionShipment } from "./shipments";

const { inventoryHolds, inventorySlots, orderItems, orders, payments, refunds, shipments } = schema;

/** Queue a refund against an order's captured payment, never exceeding what's left to refund. */
export async function createRefund(
  tx: Executor,
  args: { orderId: string; shipmentId?: string | null; amountPaise: number; reason: string },
): Promise<string | null> {
  if (args.amountPaise <= 0) return null;
  const [payment] = await tx
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.orderId, args.orderId),
        inArray(payments.status, ["CAPTURED", "PARTIALLY_REFUNDED"]),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(1)
    .for("update");
  if (!payment) return null;
  const [{ queued }] = (await tx
    .select({ queued: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)::int` })
    .from(refunds)
    .where(
      and(eq(refunds.paymentId, payment.id), inArray(refunds.status, ["PENDING", "PROCESSED"])),
    )) as [{ queued: number }];
  const amount = Math.min(args.amountPaise, payment.amountPaise - queued);
  if (amount <= 0) return null;
  const [refund] = await tx
    .insert(refunds)
    .values({
      paymentId: payment.id,
      orderId: args.orderId,
      shipmentId: args.shipmentId ?? null,
      amountPaise: amount,
      reason: args.reason,
    })
    .returning({ id: refunds.id });
  await enqueue(tx, { topic: "payment.refund", payload: { refundId: refund!.id } });
  return refund!.id;
}

/** What a shipment cost the customer, net of its share of discounts. */
export function shipmentChargePaise(s: typeof shipments.$inferSelect): number {
  return s.itemsTotalPaise + s.shippingFeePaise + s.packagingFeePaise - s.discountPaise;
}

export class OrderService {
  constructor(private readonly deps: CoreDeps) {}

  private get db() {
    return this.deps.db;
  }

  private async assertCanView(viewer: Viewer, orderId: string) {
    const [o] = await this.db
      .select({ customerId: orders.customerId })
      .from(orders)
      .where(eq(orders.id, orderId));
    if (!o) throw notFound("Order");
    if (o.customerId !== viewer.userId && !isStaff(viewer)) throw notFound("Order");
  }

  async get(viewerIn: Viewer | null, orderId: string): Promise<OrderDetail> {
    const viewer = requireViewer(viewerIn);
    await this.assertCanView(viewer, orderId);
    return loadOrderDetail(this.db, orderId, this.deps.clock());
  }

  async list(viewerIn: Viewer | null): Promise<OrderSummary[]> {
    const viewer = requireViewer(viewerIn);
    return listOrderSummaries(this.db, viewer.userId);
  }

  /**
   * Turn a cart into a held, unpaid order: re-plan every parcel, reserve inventory atomically and
   * create the payment order. Safe to retry with the same idempotency key.
   */
  async place(
    viewerIn: Viewer | null,
    req: PlaceOrderRequest,
    idempotencyKey?: string,
  ): Promise<PlaceOrderResponse> {
    const viewer = requireViewer(viewerIn);
    const now = this.deps.clock();

    if (idempotencyKey) {
      const [existing] = await this.db
        .select({ id: orders.id, customerId: orders.customerId })
        .from(orders)
        .where(eq(orders.idempotencyKey, idempotencyKey));
      if (existing) {
        if (existing.customerId !== viewer.userId)
          throw conflict("IDEMPOTENCY_KEY_REUSED", "Please retry checkout.");
        return this.withCheckout(existing.id);
      }
    }

    const phone = normaliseIndianMobile(req.shipTo.phone);
    if (!phone)
      throw invalid("INVALID_PHONE", "Enter a 10-digit Indian mobile number for the recipient.");

    let orderId: string;
    try {
      orderId = await this.db.transaction(async (tx) => {
        const { destination, groups, quote } = await planCart(tx, this.deps, req);
        if (!quote.totals.isComplete) {
          throw conflict("CART_NOT_DELIVERABLE", "Some parcels can't be delivered as planned.", {
            quote,
          });
        }
        if (
          req.expectedTotalPaise !== undefined &&
          req.expectedTotalPaise !== quote.totals.grandTotalPaise
        ) {
          throw conflict(
            "PRICE_CHANGED",
            "Prices or delivery options changed. Please review your order.",
            { quote },
          );
        }

        const gift = req.gift ?? null;
        const [order] = await tx
          .insert(orders)
          .values({
            orderNumber: newOrderNumber(now),
            customerId: viewer.userId,
            destPincode: destination.pincode,
            shipTo: {
              recipientName: req.shipTo.recipientName,
              phone,
              line1: req.shipTo.line1,
              line2: req.shipTo.line2 ?? null,
              landmark: req.shipTo.landmark ?? null,
              pincode: destination.pincode,
              cityName: destination.city?.name ?? destination.district,
              stateCode: destination.stateCode,
            },
            isGift: Boolean(gift),
            giftMessage: gift?.message ?? null,
            senderName: gift?.senderName ?? null,
            hidePrices: gift?.hidePrices ?? false,
            itemsTotalPaise: quote.totals.itemsTotalPaise,
            packagingFeePaise: quote.totals.packagingFeePaise,
            shippingFeePaise: quote.totals.shippingFeePaise,
            discountPaise: quote.totals.discountPaise,
            gstIncludedPaise: quote.totals.gstIncludedPaise,
            grandTotalPaise: quote.totals.grandTotalPaise,
            idempotencyKey: idempotencyKey ?? null,
            holdExpiresAt: addHours(now, this.deps.config.holdMinutes / 60),
          })
          .returning({ id: orders.id });

        for (const [i, g] of groups.entries()) {
          if (!g.result.ok) throw new Error("unreachable: incomplete quote passed the check");
          const plan = g.result.plan;
          const itemsTotal = g.lines.reduce((s, l) => s + lineTotal(l.engineLine), 0);
          const [shipment] = await tx
            .insert(shipments)
            .values({
              orderId: order!.id,
              sequence: i + 1,
              vendorId: g.vendor.id,
              dispatchDate: plan.dispatchDate,
              orderCutoffAt: plan.orderCutoffAt,
              promisedDeliveryDate: plan.promisedDeliveryDate,
              usuallyArrivesOn: plan.usuallyArrivesOn,
              packagingCode: plan.packagingCode,
              carrierCode: plan.carrierCode,
              mode: plan.mode,
              deadWeightG: plan.deadWeightG,
              chargeableWeightG: plan.chargeableWeightG,
              etaP50At: plan.etaP50,
              etaP90At: plan.etaP90,
              deliverByAt: plan.deliverByAt,
              itemsTotalPaise: itemsTotal,
              shippingCostPaise: plan.shippingCostPaise,
              shippingFeePaise: plan.shippingFeePaise,
              packagingFeePaise: plan.packagingFeePaise,
              discountPaise: g.subsidyPaise,
            })
            .returning({ id: shipments.id });

          for (const l of g.lines) {
            const [slot] = await tx
              .select({ id: inventorySlots.id })
              .from(inventorySlots)
              .where(
                and(
                  eq(inventorySlots.variantId, l.variant.id),
                  eq(inventorySlots.dispatchDate, plan.dispatchDate),
                ),
              );
            if (!slot || !(await reserveUnits(tx, slot.id, l.quantity))) {
              throw conflict(
                "SOLD_OUT",
                `${l.item.name} just sold out for that day. Please pick another date.`,
                {
                  variantId: l.variant.id,
                  dispatchDate: plan.dispatchDate,
                },
              );
            }
            await tx.insert(orderItems).values({
              orderId: order!.id,
              shipmentId: shipment!.id,
              variantId: l.variant.id,
              inventorySlotId: slot.id,
              quantity: l.quantity,
              unitPricePaise: l.variant.pricePaise,
              gstRateBps: l.item.gstRateBps,
              snapshot: {
                itemId: l.item.id,
                itemSlug: l.item.slug,
                itemName: l.item.name,
                variantLabel: l.variant.label,
                vendorName: g.vendor.name,
                tempClass: l.item.tempClass,
                shelfLifeHours: l.item.shelfLifeHours,
                minResidualHours: l.item.minResidualHours,
                hsnCode: l.item.hsnCode,
                diet: l.item.diet,
                sku: l.variant.sku,
              },
            });
            await tx.insert(inventoryHolds).values({
              slotId: slot.id,
              orderId: order!.id,
              quantity: l.quantity,
              expiresAt: addHours(now, this.deps.config.holdMinutes / 60),
            });
          }
          await tx.insert(schema.shipmentEvents).values({
            shipmentId: shipment!.id,
            fromStatus: null,
            toStatus: "PENDING_PAYMENT",
            actor: "CUSTOMER",
            actorId: viewer.userId,
            occurredAt: now,
          });
        }
        return order!.id;
      });
    } catch (e) {
      if (idempotencyKey && isUniqueViolation(e)) {
        const [existing] = await this.db
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.idempotencyKey, idempotencyKey));
        if (existing) return this.withCheckout(existing.id);
      }
      throw e;
    }

    return this.withCheckout(orderId);
  }

  /** Order detail plus a payment checkout, creating the provider order if needed. */
  async withCheckout(orderId: string): Promise<PlaceOrderResponse> {
    const now = this.deps.clock();
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) throw notFound("Order");
    let checkout: PlaceOrderResponse["checkout"] = null;
    if (order.status === "PENDING_PAYMENT") {
      const description = `Order ${order.orderNumber}`;
      const [payment] = await this.db
        .select()
        .from(payments)
        .where(and(eq(payments.orderId, order.id), eq(payments.status, "CREATED")))
        .orderBy(desc(payments.createdAt))
        .limit(1);
      if (payment) {
        checkout = this.deps.payments.checkoutFor(
          payment.providerOrderId,
          payment.amountPaise,
          description,
        );
      } else {
        const created = await this.deps.payments.createOrder({
          amountPaise: order.grandTotalPaise,
          receipt: order.orderNumber,
          description,
          notes: { orderId: order.id },
        });
        await this.db.insert(payments).values({
          orderId: order.id,
          provider: this.deps.payments.name,
          providerOrderId: created.providerOrderId,
          amountPaise: order.grandTotalPaise,
        });
        checkout = created.checkout;
      }
    }
    return { order: await loadOrderDetail(this.db, order.id, now), checkout };
  }

  async retryPayment(viewerIn: Viewer | null, orderId: string): Promise<PlaceOrderResponse> {
    const viewer = requireViewer(viewerIn);
    await this.assertCanView(viewer, orderId);
    return this.withCheckout(orderId);
  }

  /** The checkout widget's success callback (signature-verified). The webhook may also arrive. */
  async verifyCheckout(
    viewerIn: Viewer | null,
    orderId: string,
    input: { providerPaymentId: string; signature: string },
  ): Promise<OrderDetail> {
    const viewer = requireViewer(viewerIn);
    await this.assertCanView(viewer, orderId);
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .orderBy(desc(payments.createdAt))
      .limit(1);
    if (!payment) throw notFound("Payment");
    const ok = this.deps.payments.verifyCheckoutSignature({
      providerOrderId: payment.providerOrderId,
      providerPaymentId: input.providerPaymentId,
      signature: input.signature,
    });
    if (!ok) throw invalid("INVALID_SIGNATURE", "We couldn't verify this payment.");
    await this.confirmCapture({
      providerOrderId: payment.providerOrderId,
      providerPaymentId: input.providerPaymentId,
      amountPaise: payment.amountPaise,
      method: null,
    });
    return loadOrderDetail(this.db, orderId, this.deps.clock());
  }

  async handlePaymentWebhook(event: PaymentWebhookEvent): Promise<string> {
    switch (event.type) {
      case "payment.captured":
        return this.confirmCapture(event);
      case "payment.failed": {
        await this.db
          .update(payments)
          .set({ providerPaymentId: event.providerPaymentId })
          .where(
            and(
              eq(payments.providerOrderId, event.providerOrderId),
              eq(payments.status, "CREATED"),
            ),
          );
        return "noted";
      }
      case "refund.processed": {
        await this.db
          .update(refunds)
          .set({ status: "PROCESSED", processedAt: this.deps.clock() })
          .where(eq(refunds.providerRefundId, event.providerRefundId));
        return "refund-processed";
      }
    }
  }

  /**
   * Payment captured: held units become sold and every parcel is placed. Idempotent. A capture
   * that arrives after the hold expired is refunded in full — the food can't be promised any more.
   */
  async confirmCapture(e: {
    providerOrderId: string;
    providerPaymentId: string;
    amountPaise: number;
    method: string | null;
  }): Promise<string> {
    const now = this.deps.clock();
    return this.db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.providerOrderId, e.providerOrderId))
        .for("update");
      if (!payment) {
        this.deps.logger.warn("capture for unknown payment order", {
          providerOrderId: e.providerOrderId,
        });
        return "unknown";
      }
      // FAILED means the hold expired unpaid; a capture can still arrive and must be refunded.
      if (payment.status !== "CREATED" && payment.status !== "FAILED") return "duplicate";

      await tx
        .update(payments)
        .set({
          status: "CAPTURED",
          providerPaymentId: e.providerPaymentId,
          method: e.method,
          capturedAt: now,
        })
        .where(eq(payments.id, payment.id));

      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, payment.orderId))
        .for("update");
      if (!order) return "unknown";

      if (order.status !== "PENDING_PAYMENT" || e.amountPaise !== payment.amountPaise) {
        this.deps.logger.warn("late or mismatched capture refunded", {
          orderId: order.id,
          status: order.status,
          amount: e.amountPaise,
        });
        await createRefund(tx, {
          orderId: order.id,
          amountPaise: e.amountPaise,
          reason: "Payment arrived after the order expired",
        });
        await enqueue(tx, {
          topic: "notify",
          payload: { template: "LATE_PAYMENT_REFUNDED", orderId: order.id },
        });
        return "refunded";
      }

      const holds = await tx
        .select()
        .from(inventoryHolds)
        .where(
          and(
            eq(inventoryHolds.orderId, order.id),
            isNull(inventoryHolds.convertedAt),
            isNull(inventoryHolds.releasedAt),
          ),
        );
      for (const h of holds) {
        await convertReservation(tx, h.slotId, h.quantity);
        await tx
          .update(inventoryHolds)
          .set({ convertedAt: now })
          .where(eq(inventoryHolds.id, h.id));
      }

      await tx
        .update(orders)
        .set({ placedAt: now, holdExpiresAt: null, updatedAt: now })
        .where(eq(orders.id, order.id));
      const orderShipments = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.orderId, order.id));
      for (const s of orderShipments) {
        await transitionShipment(tx, {
          shipmentId: s.id,
          to: "PLACED",
          actor: "SYSTEM",
          note: "Payment received",
          now,
        });
        await enqueue(tx, {
          topic: "notify",
          payload: { template: "VENDOR_NEW_ORDER", orderId: order.id, shipmentId: s.id },
        });
      }
      await refreshOrderStatus(tx, order.id, now);
      await enqueue(tx, {
        topic: "notify",
        payload: { template: "ORDER_CONFIRMED", orderId: order.id },
      });
      if (order.isGift) {
        await enqueue(tx, {
          topic: "notify",
          payload: { template: "GIFT_HEADS_UP", orderId: order.id },
        });
      }
      return "captured";
    });
  }

  /** Cancel every parcel that is still before its kitchen's cutoff; refund what was paid for them. */
  async cancel(
    viewerIn: Viewer | null,
    orderId: string,
    reason = "Cancelled by customer",
  ): Promise<OrderDetail> {
    const viewer = requireViewer(viewerIn);
    const now = this.deps.clock();
    await this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      if (!order) throw notFound("Order");
      const staff = isStaff(viewer);
      if (order.customerId !== viewer.userId && !staff) throw forbidden();

      const list = await tx.select().from(shipments).where(eq(shipments.orderId, orderId));
      const cancellable = list.filter((s) => canCustomerCancel(s.status, s.orderCutoffAt, now));
      if (cancellable.length === 0) {
        throw conflict(
          "CANNOT_CANCEL",
          "The kitchen has already started on this order, so it can't be cancelled now.",
        );
      }

      let refund = 0;
      for (const s of cancellable) {
        const lines = await tx.select().from(orderItems).where(eq(orderItems.shipmentId, s.id));
        if (s.status === "PLACED") {
          for (const l of lines) await releaseSold(tx, l.inventorySlotId, l.quantity);
          refund += shipmentChargePaise(s);
        } else {
          await this.releaseHolds(tx, orderId, now);
        }
        await transitionShipment(tx, {
          shipmentId: s.id,
          to: "CANCELLED",
          actor: staff && order.customerId !== viewer.userId ? "OPS" : "CUSTOMER",
          actorId: viewer.userId,
          note: reason,
          now,
        });
      }
      if (refund > 0) {
        await createRefund(tx, { orderId, amountPaise: refund, reason });
        await enqueue(tx, {
          topic: "notify",
          payload: { template: "ORDER_CANCELLED", orderId, extra: { refundPaise: String(refund) } },
        });
      }
    });
    return loadOrderDetail(this.db, orderId, now);
  }

  private async releaseHolds(tx: Executor, orderId: string, now: Date) {
    const holds = await tx
      .select()
      .from(inventoryHolds)
      .where(
        and(
          eq(inventoryHolds.orderId, orderId),
          isNull(inventoryHolds.convertedAt),
          isNull(inventoryHolds.releasedAt),
        ),
      );
    for (const h of holds) {
      await releaseReservation(tx, h.slotId, h.quantity);
      await tx.update(inventoryHolds).set({ releasedAt: now }).where(eq(inventoryHolds.id, h.id));
    }
  }

  /** Unpaid checkouts past their hold: give the stock back and close them. */
  async expireUnpaid(limit = 100): Promise<number> {
    const now = this.deps.clock();
    const due = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.status, "PENDING_PAYMENT"), lte(orders.holdExpiresAt, now)))
      .limit(limit);
    let expired = 0;
    for (const { id } of due) {
      const done = await this.db.transaction(async (tx) => {
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, id))
          .for("update", { skipLocked: true });
        if (order?.status !== "PENDING_PAYMENT") return false;
        await this.releaseHolds(tx, id, now);
        const list = await tx.select().from(shipments).where(eq(shipments.orderId, id));
        for (const s of list) {
          if (s.status === "PENDING_PAYMENT") {
            await transitionShipment(tx, {
              shipmentId: s.id,
              to: "CANCELLED",
              actor: "SYSTEM",
              note: "Payment not completed in time",
              now,
            });
          }
        }
        await tx
          .update(payments)
          .set({ status: "FAILED" })
          .where(and(eq(payments.orderId, id), eq(payments.status, "CREATED")));
        return true;
      });
      if (done) expired++;
    }
    return expired;
  }
}
