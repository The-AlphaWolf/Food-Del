import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { inventorySlots, itemVariants, vendors } from "./catalog";
import {
  actorEnum,
  claimKindEnum,
  claimResolutionEnum,
  claimStatusEnum,
  failureReasonEnum,
  orderStatusEnum,
  outboxStatusEnum,
  paymentProviderEnum,
  paymentStatusEnum,
  payoutStatusEnum,
  refundStatusEnum,
  shipModeEnum,
  shipmentStatusEnum,
} from "./enums";
import { pincodes } from "./geo";
import { profiles } from "./identity";
import { dispatchBatches, packagingProfiles } from "./logistics";
/** The customer's checkout: one payment, one or more shipments. */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number").notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => profiles.id),
    /** Derived from shipments; kept denormalised for listing and RLS. */
    status: orderStatusEnum("status").notNull().default("PENDING_PAYMENT"),
    destPincode: char("dest_pincode", { length: 6 })
      .notNull()
      .references(() => pincodes.pincode),
    shipTo: jsonb("ship_to").$type().notNull(),
    isGift: boolean("is_gift").notNull().default(false),
    giftMessage: text("gift_message"),
    senderName: text("sender_name"),
    hidePrices: boolean("hide_prices").notNull().default(false),
    itemsTotalPaise: integer("items_total_paise").notNull(),
    packagingFeePaise: integer("packaging_fee_paise").notNull(),
    shippingFeePaise: integer("shipping_fee_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    gstIncludedPaise: integer("gst_included_paise").notNull().default(0),
    grandTotalPaise: integer("grand_total_paise").notNull(),
    /** Client-supplied key so a retried "place order" never double-books. */
    idempotencyKey: text("idempotency_key").unique(),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    placedAt: timestamp("placed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "orders_total",
      sql`${t.grandTotalPaise} = ${t.itemsTotalPaise} + ${t.packagingFeePaise} + ${t.shippingFeePaise} - ${t.discountPaise}`,
    ),
    check("orders_amounts", sql`${t.itemsTotalPaise} > 0 and ${t.discountPaise} >= 0`),
    index("orders_customer_idx").on(t.customerId, t.createdAt),
    index("orders_pending_idx").on(t.holdExpiresAt).where(sql`${t.status} = 'PENDING_PAYMENT'`),
  ],
);
/** One vendor's parcel within an order: the unit of fulfilment, tracking and payout. */
export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    sequence: smallint("sequence").notNull(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    batchId: uuid("batch_id").references(() => dispatchBatches.id),
    status: shipmentStatusEnum("status").notNull().default("PENDING_PAYMENT"),
    version: integer("version").notNull().default(0),
    dispatchDate: date("dispatch_date", { mode: "string" }).notNull(),
    orderCutoffAt: timestamp("order_cutoff_at", { withTimezone: true }).notNull(),
    promisedDeliveryDate: date("promised_delivery_date", { mode: "string" }).notNull(),
    usuallyArrivesOn: date("usually_arrives_on", { mode: "string" }).notNull(),
    packagingCode: text("packaging_code")
      .notNull()
      .references(() => packagingProfiles.code),
    carrierCode: text("carrier_code").notNull(),
    mode: shipModeEnum("mode").notNull(),
    awbNumber: text("awb_number").unique(),
    carrierShipmentRef: text("carrier_shipment_ref"),
    labelUrl: text("label_url"),
    trackingUrl: text("tracking_url"),
    deadWeightG: integer("dead_weight_g").notNull(),
    chargeableWeightG: integer("chargeable_weight_g").notNull(),
    etaP50At: timestamp("eta_p50_at", { withTimezone: true }).notNull(),
    etaP90At: timestamp("eta_p90_at", { withTimezone: true }).notNull(),
    /** Spoilage deadline; recomputed from actual preparation time when packed. */
    deliverByAt: timestamp("deliver_by_at", { withTimezone: true }).notNull(),
    latestEtaAt: timestamp("latest_eta_at", { withTimezone: true }),
    isAtRisk: boolean("is_at_risk").notNull().default(false),
    preparedAt: timestamp("prepared_at", { withTimezone: true }),
    packedAt: timestamp("packed_at", { withTimezone: true }),
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    failureReason: failureReasonEnum("failure_reason"),
    itemsTotalPaise: integer("items_total_paise").notNull(),
    shippingCostPaise: integer("shipping_cost_paise").notNull(),
    shippingFeePaise: integer("shipping_fee_paise").notNull(),
    packagingFeePaise: integer("packaging_fee_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "shipments_failure_reason",
      sql`(${t.status} = 'FAILED') = (${t.failureReason} is not null)`,
    ),
    check("shipments_promise", sql`${t.etaP90At} <= ${t.deliverByAt} or ${t.packedAt} is not null`),
    uniqueIndex("shipments_order_seq").on(t.orderId, t.sequence),
    index("shipments_vendor_day_idx").on(t.vendorId, t.dispatchDate, t.status),
    index("shipments_cutoff_idx").on(t.orderCutoffAt).where(sql`${t.status} = 'PLACED'`),
    index("shipments_open_idx")
      .on(t.status)
      .where(sql`${t.status} not in ('DELIVERED', 'CANCELLED', 'FAILED')`),
  ],
);
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => itemVariants.id),
    inventorySlotId: uuid("inventory_slot_id")
      .notNull()
      .references(() => inventorySlots.id),
    quantity: smallint("quantity").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    gstRateBps: integer("gst_rate_bps").notNull(),
    snapshot: jsonb("snapshot").$type().notNull(),
  },
  (t) => [
    check("order_items_qty", sql`${t.quantity} > 0`),
    index("order_items_shipment_idx").on(t.shipmentId),
    index("order_items_order_idx").on(t.orderId),
  ],
);
/** Units held for an unpaid order. Converted to sold on capture, released on expiry. */
export const inventoryHolds = pgTable(
  "inventory_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => inventorySlots.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (t) => [
    check("holds_qty", sql`${t.quantity} > 0`),
    check("holds_single_outcome", sql`${t.convertedAt} is null or ${t.releasedAt} is null`),
    index("holds_order_idx").on(t.orderId),
    index("holds_open_idx")
      .on(t.expiresAt)
      .where(sql`${t.convertedAt} is null and ${t.releasedAt} is null`),
  ],
);
/** Append-only timeline and audit trail. */
export const shipmentEvents = pgTable(
  "shipment_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    fromStatus: shipmentStatusEnum("from_status"),
    toStatus: shipmentStatusEnum("to_status").notNull(),
    actor: actorEnum("actor").notNull(),
    actorId: uuid("actor_id"),
    /** Carrier's own event id, for webhook idempotency. */
    externalEventId: text("external_event_id"),
    note: text("note"),
    carrierPayload: jsonb("carrier_payload"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("shipment_events_shipment_idx").on(t.shipmentId, t.id),
    uniqueIndex("shipment_events_external")
      .on(t.shipmentId, t.externalEventId)
      .where(sql`${t.externalEventId} is not null`),
  ],
);
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    provider: paymentProviderEnum("provider").notNull(),
    providerOrderId: text("provider_order_id").notNull().unique(),
    providerPaymentId: text("provider_payment_id").unique(),
    amountPaise: integer("amount_paise").notNull(),
    refundedPaise: integer("refunded_paise").notNull().default(0),
    status: paymentStatusEnum("status").notNull().default("CREATED"),
    method: text("method"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("payments_refund_bound", sql`${t.refundedPaise} between 0 and ${t.amountPaise}`),
    index("payments_order_idx").on(t.orderId),
  ],
);
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    shipmentId: uuid("shipment_id").references(() => shipments.id),
    amountPaise: integer("amount_paise").notNull(),
    reason: text("reason").notNull(),
    providerRefundId: text("provider_refund_id").unique(),
    status: refundStatusEnum("status").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [check("refunds_amount", sql`${t.amountPaise} > 0`)],
);
/** Vendor settlement per shipment, held until delivery plus the claim window. */
export const vendorPayouts = pgTable(
  "vendor_payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    shipmentId: uuid("shipment_id")
      .notNull()
      .unique()
      .references(() => shipments.id),
    grossPaise: integer("gross_paise").notNull(),
    commissionPaise: integer("commission_paise").notNull(),
    netPaise: integer("net_paise").notNull(),
    status: payoutStatusEnum("status").notNull().default("ON_HOLD"),
    releaseAfter: timestamp("release_after", { withTimezone: true }).notNull(),
    providerTransferId: text("provider_transfer_id"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("payouts_math", sql`${t.netPaise} = ${t.grossPaise} - ${t.commissionPaise}`),
    index("payouts_release_idx").on(t.releaseAfter).where(sql`${t.status} = 'ON_HOLD'`),
  ],
);
export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => profiles.id),
    kind: claimKindEnum("kind").notNull(),
    description: text("description").notNull(),
    photoUrls: text("photo_urls").array().notNull().default(sql`'{}'::text[]`),
    status: claimStatusEnum("status").notNull().default("OPEN"),
    resolution: claimResolutionEnum("resolution"),
    refundPaise: integer("refund_paise").notNull().default(0),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("claims_status_idx").on(t.status, t.createdAt)],
);
/**
 * Transactional outbox: side effects (notifications, carrier bookings, refunds) are written in
 * the same transaction as the state change and executed afterwards by a worker.
 */
export const outbox = pgTable(
  "outbox",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    topic: text("topic").notNull(),
    payload: jsonb("payload").notNull(),
    status: outboxStatusEnum("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("outbox_pending_idx").on(t.availableAt).where(sql`${t.status} = 'PENDING'`)],
);
/** Every notification we send, for support and DPDP audit. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    channel: varchar("channel", { length: 16 }).notNull(),
    recipient: text("recipient").notNull(),
    template: text("template").notNull(),
    body: text("body").notNull(),
    providerRef: text("provider_ref"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_order_idx").on(t.orderId)],
);
