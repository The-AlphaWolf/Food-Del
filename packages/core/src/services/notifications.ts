/**
 * Message templates. Each renders to plain text plus ordered parameters for the provider-side
 * templates (DLT for SMS, approved templates for WhatsApp). Keep them short, factual and useful:
 * every message should tell the person what happens next.
 */
import { type Executor, schema } from "@food-del/db";
import { formatINR, formatIstTime, formatLocalDate, istDateOf } from "@food-del/domain";
import type { OutboundMessage } from "@food-del/integrations";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { CoreDeps } from "../deps";

const { cities, notifications, orderItems, orders, profiles, shipments, vendors } = schema;

export const TEMPLATES = [
  "ORDER_CONFIRMED",
  "GIFT_HEADS_UP",
  "VENDOR_NEW_ORDER",
  "VENDOR_BATCH_LOCKED",
  "SHIPMENT_PACKED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERY_ATTEMPT_FAILED",
  "DELIVERED",
  "ORDER_CANCELLED",
  "SHIPMENT_FAILED",
  "LATE_PAYMENT_REFUNDED",
  "CLAIM_RESOLVED",
  "OPS_AT_RISK",
] as const;
export type Template = (typeof TEMPLATES)[number];

const FAILURE_COPY: Record<string, string> = {
  VENDOR_UNFULFILLED: "the kitchen couldn't make it",
  SPOILED: "it wouldn't have arrived fresh",
  LOST: "the courier lost it",
  DAMAGED: "it was damaged in transit",
  UNDELIVERABLE: "we couldn't reach you",
};

interface Ctx {
  order: typeof orders.$inferSelect;
  buyer: typeof profiles.$inferSelect | null;
  shipment:
    | (typeof shipments.$inferSelect & {
        vendorName: string;
        vendorCity: string;
        vendorPhone: string;
      })
    | null;
  firstItem: string;
  extra: Record<string, string>;
}

export class NotificationService {
  constructor(private readonly deps: CoreDeps) {}

  private async context(
    db: Executor,
    orderId: string,
    shipmentId: string | undefined,
    extra: Record<string, string>,
  ): Promise<Ctx | null> {
    const [row] = await db
      .select({ o: orders, p: profiles })
      .from(orders)
      .leftJoin(profiles, eq(profiles.id, orders.customerId))
      .where(eq(orders.id, orderId));
    if (!row) return null;
    let shipment: Ctx["shipment"] = null;
    if (shipmentId) {
      const [s] = await db
        .select({ s: shipments, v: vendors, c: cities })
        .from(shipments)
        .innerJoin(vendors, eq(vendors.id, shipments.vendorId))
        .innerJoin(cities, eq(cities.id, vendors.cityId))
        .where(eq(shipments.id, shipmentId));
      if (s) {
        shipment = {
          ...s.s,
          vendorName: s.v.name,
          vendorCity: s.c.name,
          vendorPhone: s.v.pickupAddress.contactPhone,
        };
      }
    }
    const [item] = await db
      .select({ name: sql<string>`${orderItems.snapshot}->>'itemName'` })
      .from(orderItems)
      .where(shipmentId ? eq(orderItems.shipmentId, shipmentId) : eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.id))
      .limit(1);
    return { order: row.o, buyer: row.p, shipment, firstItem: item?.name ?? "your order", extra };
  }

  private trackUrl(orderId: string) {
    return `${this.deps.config.appUrl}/orders/${orderId}`;
  }

  /** Render a template into the messages to send (possibly none). */
  async render(
    db: Executor,
    template: Template,
    orderId: string,
    shipmentId?: string,
    extra: Record<string, string> = {},
  ): Promise<OutboundMessage[]> {
    const ctx = await this.context(db, orderId, shipmentId, extra);
    if (!ctx) return [];
    const { order, buyer, shipment } = ctx;
    const brand = this.deps.config.brandName;
    const buyerPhone = buyer?.phone ?? order.shipTo.phone;
    const recipientPhone = order.shipTo.phone;
    const toBuyer = (body: string, params: string[], withEmail = false): OutboundMessage[] => [
      { channel: "WHATSAPP", to: buyerPhone, template, params, body },
      ...(withEmail && buyer?.email
        ? [
            {
              channel: "EMAIL" as const,
              to: buyer.email,
              template,
              params,
              subject: `${brand} · ${order.orderNumber}`,
              body,
            },
          ]
        : []),
    ];
    const toRecipient = (body: string, params: string[], urgent = false): OutboundMessage[] => [
      { channel: "WHATSAPP", to: recipientPhone, template, params, body },
      ...(urgent ? [{ channel: "SMS" as const, to: recipientPhone, template, params, body }] : []),
    ];
    const from = shipment ? `${ctx.firstItem} from ${shipment.vendorCity}` : ctx.firstItem;

    switch (template) {
      case "ORDER_CONFIRMED": {
        const parcels = await db
          .select({ date: shipments.promisedDeliveryDate })
          .from(shipments)
          .where(and(eq(shipments.orderId, orderId), eq(shipments.status, "PLACED")))
          .orderBy(asc(shipments.promisedDeliveryDate));
        const first = parcels[0]?.date;
        const body = `${brand}: order ${order.orderNumber} is confirmed — ${parcels.length} parcel${parcels.length === 1 ? "" : "s"}${first ? `, the first arriving by ${formatLocalDate(first)}` : ""}. Track it: ${this.trackUrl(orderId)}`;
        return toBuyer(
          body,
          [
            order.orderNumber,
            String(parcels.length),
            first ? formatLocalDate(first) : "",
            this.trackUrl(orderId),
          ],
          true,
        );
      }
      case "GIFT_HEADS_UP": {
        if (!order.isGift) return [];
        const sender = order.senderName ?? buyer?.fullName ?? "Someone special";
        const body = `${sender} is sending you ${ctx.firstItem} via ${brand}. It's perishable, so please keep your phone handy on delivery day.${order.giftMessage ? ` Message: “${order.giftMessage}”` : ""}`;
        return toRecipient(body, [sender, ctx.firstItem, order.giftMessage ?? ""]);
      }
      case "VENDOR_NEW_ORDER": {
        if (!shipment) return [];
        const lines = await db
          .select({
            q: orderItems.quantity,
            name: sql<string>`${orderItems.snapshot}->>'itemName'`,
            label: sql<string>`${orderItems.snapshot}->>'variantLabel'`,
          })
          .from(orderItems)
          .where(eq(orderItems.shipmentId, shipment.id));
        const summary = lines.map((l) => `${l.q} × ${l.name} (${l.label})`).join(", ");
        const body = `${brand}: new order ${order.orderNumber} for dispatch ${formatLocalDate(shipment.dispatchDate)}: ${summary}.`;
        return [
          {
            channel: "WHATSAPP",
            to: shipment.vendorPhone,
            template,
            params: [order.orderNumber, formatLocalDate(shipment.dispatchDate), summary],
            body,
          },
        ];
      }
      case "VENDOR_BATCH_LOCKED": {
        const vendorId = extra.vendorId;
        const date = extra.date;
        if (!vendorId || !date) return [];
        const [v] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
        if (!v) return [];
        const [agg] = await db
          .select({
            parcels: sql<number>`count(distinct ${shipments.id})::int`,
            units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
          })
          .from(shipments)
          .innerJoin(orderItems, eq(orderItems.shipmentId, shipments.id))
          .where(
            and(
              eq(shipments.vendorId, vendorId),
              eq(shipments.dispatchDate, date),
              inArray(shipments.status, ["BATCHED"]),
            ),
          );
        const body = `${brand}: orders for ${formatLocalDate(date)} are locked — ${agg?.units ?? 0} units across ${agg?.parcels ?? 0} parcels. Pack by ${v.readyForPickupLocal.slice(0, 5)}. Production sheet: ${this.deps.config.appUrl}/vendor/${v.id}/day/${date}`;
        return [
          {
            channel: "WHATSAPP",
            to: v.pickupAddress.contactPhone,
            template,
            params: [formatLocalDate(date), String(agg?.units ?? 0), String(agg?.parcels ?? 0)],
            body,
          },
        ];
      }
      case "SHIPMENT_PACKED": {
        if (!shipment) return [];
        const body = `Your ${from} is packed${shipment.packagingCode.startsWith("PCM") ? " with cold packs" : ""} and on its way to the courier. Arrives by ${formatLocalDate(shipment.promisedDeliveryDate)}.`;
        return toBuyer(body, [from, formatLocalDate(shipment.promisedDeliveryDate)]);
      }
      case "IN_TRANSIT": {
        if (!shipment) return [];
        const body = `Your ${from} has left ${shipment.vendorCity} and is on its way to ${order.shipTo.cityName}. Arrives by ${formatLocalDate(shipment.promisedDeliveryDate)}.`;
        return toBuyer(body, [
          from,
          shipment.vendorCity,
          formatLocalDate(shipment.promisedDeliveryDate),
        ]);
      }
      case "OUT_FOR_DELIVERY": {
        const body = `Out for delivery today: ${from}. It's perishable — please be available to receive it.`;
        return toRecipient(body, [from]);
      }
      case "DELIVERY_ATTEMPT_FAILED": {
        const body = `We tried to deliver ${from} but couldn't reach you. The courier will try again — it's perishable, so please be available today. Help: ${this.trackUrl(orderId)}`;
        return toRecipient(body, [from, this.trackUrl(orderId)], true);
      }
      case "DELIVERED": {
        if (!shipment) return [];
        const best = istDateOf(shipment.deliverByAt);
        const body = `Delivered: ${from}. Best enjoyed by ${formatLocalDate(best)}. Something not right? Tell us within ${this.deps.config.claimWindowHours} hours: ${this.trackUrl(orderId)}`;
        return toBuyer(body, [from, formatLocalDate(best), this.trackUrl(orderId)], true);
      }
      case "ORDER_CANCELLED": {
        const refund = Number(extra.refundPaise ?? 0);
        const body = `${brand}: order ${order.orderNumber} is cancelled.${refund > 0 ? ` A refund of ${formatINR(refund)} is on its way to your original payment method.` : ""}`;
        return toBuyer(body, [order.orderNumber, formatINR(refund)], true);
      }
      case "SHIPMENT_FAILED": {
        if (!shipment) return [];
        const why = shipment.failureReason ? FAILURE_COPY[shipment.failureReason] : "plans changed";
        const refundable = shipment.failureReason !== "UNDELIVERABLE";
        const body = `We're sorry — your ${from} couldn't be delivered (${why}).${refundable ? " A full refund is on its way to your original payment method." : ""}`;
        return toBuyer(body, [from, why ?? ""], true);
      }
      case "LATE_PAYMENT_REFUNDED": {
        const body = `${brand}: your payment for ${order.orderNumber} arrived after the order had expired, so we've refunded it in full. Please place the order again — availability may have changed.`;
        return toBuyer(body, [order.orderNumber], true);
      }
      case "CLAIM_RESOLVED": {
        const refund = Number(extra.refundPaise ?? 0);
        const body =
          extra.decision === "APPROVED"
            ? `We've looked into your report on ${from}.${refund > 0 ? ` A refund of ${formatINR(refund)} is on its way.` : ""} Thank you for telling us.`
            : `We've looked into your report on ${from} and couldn't approve it this time. Reply here if you'd like us to take another look.`;
        return toBuyer(body, [from, formatINR(refund)], true);
      }
      case "OPS_AT_RISK": {
        if (!shipment) return [];
        const eta = shipment.latestEtaAt ?? shipment.etaP90At;
        const body = `AT RISK ${order.orderNumber} (${shipment.awbNumber ?? "no AWB"}, ${shipment.vendorCity} → ${order.shipTo.cityName}): ETA ${formatLocalDate(istDateOf(eta))} ${formatIstTime(eta)} vs deliver-by ${formatLocalDate(istDateOf(shipment.deliverByAt))} ${formatIstTime(shipment.deliverByAt)}.`;
        const out: OutboundMessage[] = [];
        if (this.deps.config.opsPhone)
          out.push({
            channel: "WHATSAPP",
            to: this.deps.config.opsPhone,
            template,
            params: [order.orderNumber],
            body,
          });
        if (this.deps.config.opsEmail)
          out.push({
            channel: "EMAIL",
            to: this.deps.config.opsEmail,
            template,
            params: [order.orderNumber],
            subject: `At risk: ${order.orderNumber}`,
            body,
          });
        return out;
      }
    }
  }

  /** Render and send, recording every message for support and audit. */
  async send(
    db: Executor,
    template: Template,
    orderId: string,
    shipmentId?: string,
    extra: Record<string, string> = {},
  ): Promise<number> {
    const messages = await this.render(db, template, orderId, shipmentId, extra);
    for (const m of messages) {
      const { providerRef } = await this.deps.notifier.send(m);
      await db.insert(notifications).values({
        orderId,
        channel: m.channel,
        recipient: m.to,
        template: m.template,
        body: m.body,
        providerRef,
      });
    }
    return messages.length;
  }
}
