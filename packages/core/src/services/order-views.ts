import { type Executor, schema } from "@food-del/db";
import {
  canCustomerCancel,
  ORDER_STATUS_LABELS,
  SHIPMENT_STATUS_LABELS,
  timelinePosition,
} from "@food-del/domain";
import type { OrderDetail, OrderSummary, ShipmentDetail } from "@food-del/domain/contracts";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { notFound } from "../errors";
import { iso, isoOrNull, vendorSummary } from "../mappers";

const { cities, orderItems, orders, payments, shipmentEvents, shipments, vendors } = schema;

export async function loadOrderDetail(
  db: Executor,
  orderId: string,
  now: Date,
): Promise<OrderDetail> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw notFound("Order");

  const shipmentRows = await db
    .select({ s: shipments, v: vendors, c: cities })
    .from(shipments)
    .innerJoin(vendors, eq(vendors.id, shipments.vendorId))
    .innerJoin(cities, eq(cities.id, vendors.cityId))
    .where(eq(shipments.orderId, orderId))
    .orderBy(asc(shipments.sequence));
  const ids = shipmentRows.map((r) => r.s.id);
  const [itemRows, eventRows, paymentRows] = await Promise.all([
    ids.length ? db.select().from(orderItems).where(inArray(orderItems.shipmentId, ids)) : [],
    ids.length
      ? db
          .select()
          .from(shipmentEvents)
          .where(inArray(shipmentEvents.shipmentId, ids))
          .orderBy(asc(shipmentEvents.id))
      : [],
    db
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .orderBy(desc(payments.createdAt))
      .limit(1),
  ]);

  const shipmentDetails: ShipmentDetail[] = shipmentRows.map(({ s, v, c }) => ({
    id: s.id,
    sequence: s.sequence,
    status: s.status,
    statusLabel: SHIPMENT_STATUS_LABELS[s.status],
    timelinePosition: timelinePosition(s.status),
    vendor: vendorSummary({ ...v, citySlug: c.slug, cityName: c.name }),
    dispatchDate: s.dispatchDate,
    promisedDeliveryDate: s.promisedDeliveryDate,
    usuallyArrivesOn: s.usuallyArrivesOn,
    orderCutoffAt: iso(s.orderCutoffAt),
    deliverByAt: iso(s.deliverByAt),
    mode: s.mode,
    carrierCode: s.carrierCode,
    packagingCode: s.packagingCode,
    awbNumber: s.awbNumber,
    trackingUrl: s.trackingUrl,
    isAtRisk: s.isAtRisk,
    failureReason: s.failureReason,
    lines: itemRows
      .filter((i) => i.shipmentId === s.id)
      .map((i) => ({
        itemSlug: i.snapshot.itemSlug,
        itemName: i.snapshot.itemName,
        variantLabel: i.snapshot.variantLabel,
        quantity: i.quantity,
        unitPricePaise: i.unitPricePaise,
        tempClass: i.snapshot.tempClass,
      })),
    itemsTotalPaise: s.itemsTotalPaise,
    shippingFeePaise: s.shippingFeePaise,
    packagingFeePaise: s.packagingFeePaise,
    canCancel: canCustomerCancel(s.status, s.orderCutoffAt, now),
    timeline: eventRows
      .filter((e) => e.shipmentId === s.id)
      .map((e) => ({
        status: e.toStatus,
        label: SHIPMENT_STATUS_LABELS[e.toStatus],
        at: iso(e.occurredAt),
        actor: e.actor,
        note: e.note,
      })),
  }));

  const payment = paymentRows[0];
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    createdAt: iso(order.createdAt),
    placedAt: isoOrNull(order.placedAt),
    holdExpiresAt: order.status === "PENDING_PAYMENT" ? isoOrNull(order.holdExpiresAt) : null,
    shipTo: {
      recipientName: order.shipTo.recipientName,
      phone: order.shipTo.phone,
      line1: order.shipTo.line1,
      line2: order.shipTo.line2 ?? null,
      landmark: order.shipTo.landmark ?? null,
      pincode: order.shipTo.pincode,
      cityName: order.shipTo.cityName,
      stateCode: order.shipTo.stateCode,
    },
    isGift: order.isGift,
    giftMessage: order.giftMessage,
    senderName: order.senderName,
    totals: {
      itemsTotalPaise: order.itemsTotalPaise,
      shippingFeePaise: order.shippingFeePaise,
      packagingFeePaise: order.packagingFeePaise,
      discountPaise: order.discountPaise,
      grandTotalPaise: order.grandTotalPaise,
      gstIncludedPaise: order.gstIncludedPaise,
    },
    shipments: shipmentDetails,
    payment: payment
      ? {
          provider: payment.provider,
          status: payment.status,
          method: payment.method,
          amountPaise: payment.amountPaise,
          refundedPaise: payment.refundedPaise,
        }
      : null,
    canCancel: shipmentDetails.some((s) => s.canCancel),
  };
}

export async function listOrderSummaries(
  db: Executor,
  customerId: string,
  limit = 50,
): Promise<OrderSummary[]> {
  const rows = await db
    .select({
      o: orders,
      itemCount: sql<number>`(select coalesce(sum(oi.quantity), 0)::int from order_items oi where oi.order_id = "orders"."id")`,
      headline: sql<string>`(select oi.snapshot->>'itemName' from order_items oi where oi.order_id = "orders"."id" order by oi.id limit 1)`,
      nextDelivery: sql<string | null>`(
        select min(s.promised_delivery_date)::text from shipments s
        where s.order_id = "orders"."id" and s.status not in ('DELIVERED', 'CANCELLED', 'FAILED')
      )`,
    })
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
  return rows.map(({ o, itemCount, headline, nextDelivery }) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    statusLabel: ORDER_STATUS_LABELS[o.status],
    createdAt: iso(o.createdAt),
    grandTotalPaise: o.grandTotalPaise,
    itemCount,
    headline: itemCount > 1 && headline ? `${headline} and more` : (headline ?? "Order"),
    destCity: o.shipTo.cityName,
    nextDeliveryDate: nextDelivery,
  }));
}
