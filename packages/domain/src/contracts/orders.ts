import { z } from "zod";
import { VendorSummarySchema } from "./catalog";
import {
  ActorSchema,
  DietSchema,
  FailureReasonSchema,
  Instant,
  LocalDateString,
  Money,
  OrderStatusSchema,
  Pincode,
  ReasonCodeSchema,
  ShipModeSchema,
  ShipmentStatusSchema,
  TempClassSchema,
} from "./common";
import { PlanSummarySchema } from "./serviceability";

// ─── Quotes ────────────────────────────────────────────────────────────────────────────────────

export const CartLineSchema = z
  .object({
    variantId: z.string().min(1),
    quantity: z.number().int().min(1).max(20),
    /** Requested arrival date (gifting); omit for the earliest possible. */
    arriveOn: LocalDateString.nullable().optional(),
  })
  .meta({ id: "CartLine" });
export type CartLine = z.infer<typeof CartLineSchema>;

export const QuoteRequestSchema = z
  .object({
    pincode: Pincode,
    lines: z.array(CartLineSchema).min(1).max(30),
  })
  .meta({ id: "QuoteRequest" });
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export const QuoteLineSchema = z
  .object({
    variantId: z.string(),
    itemId: z.string(),
    itemSlug: z.string(),
    itemName: z.string(),
    variantLabel: z.string(),
    quantity: z.number().int(),
    unitPricePaise: Money,
    lineTotalPaise: Money,
    tempClass: TempClassSchema,
    diet: DietSchema,
    artKey: z.string().nullable(),
    imageUrl: z.string().nullable(),
  })
  .meta({ id: "QuoteLine" });
export type QuoteLine = z.infer<typeof QuoteLineSchema>;

export const QuoteShipmentSchema = z
  .object({
    key: z.string(),
    vendor: VendorSummarySchema,
    arriveOn: LocalDateString.nullable(),
    lines: z.array(QuoteLineSchema),
    plan: PlanSummarySchema.nullable(),
    issue: z.object({ reason: ReasonCodeSchema, message: z.string() }).nullable(),
    subsidyPaise: Money,
  })
  .meta({ id: "QuoteShipment" });
export type QuoteShipment = z.infer<typeof QuoteShipmentSchema>;

export const QuoteTotalsSchema = z
  .object({
    itemsTotalPaise: Money,
    shippingFeePaise: Money,
    packagingFeePaise: Money,
    discountPaise: Money,
    grandTotalPaise: Money,
    gstIncludedPaise: Money,
    isComplete: z.boolean(),
  })
  .meta({ id: "QuoteTotals" });
export type QuoteTotals = z.infer<typeof QuoteTotalsSchema>;

export const QuoteSchema = z
  .object({
    pincode: z.string(),
    destination: z.object({ cityName: z.string(), district: z.string(), isOda: z.boolean() }),
    shipments: z.array(QuoteShipmentSchema),
    totals: QuoteTotalsSchema,
    quotedAt: Instant,
  })
  .meta({ id: "Quote" });
export type Quote = z.infer<typeof QuoteSchema>;

// ─── Orders ────────────────────────────────────────────────────────────────────────────────────

export const ShipToInputSchema = z
  .object({
    recipientName: z.string().trim().min(2).max(80),
    phone: z.string().trim().min(10).max(16),
    line1: z.string().trim().min(3).max(160),
    line2: z.string().trim().max(160).nullable().optional(),
    landmark: z.string().trim().max(120).nullable().optional(),
  })
  .meta({ id: "ShipToInput" });
export type ShipToInput = z.infer<typeof ShipToInputSchema>;

export const ShipToSchema = ShipToInputSchema.extend({
  pincode: z.string(),
  cityName: z.string(),
  stateCode: z.string(),
}).meta({ id: "ShipTo" });
export type ShipTo = z.infer<typeof ShipToSchema>;

export const GiftSchema = z
  .object({
    message: z.string().trim().max(280).nullable().optional(),
    senderName: z.string().trim().max(80).nullable().optional(),
    hidePrices: z.boolean().optional(),
  })
  .meta({ id: "Gift" });

export const PlaceOrderRequestSchema = z
  .object({
    pincode: Pincode,
    shipTo: ShipToInputSchema,
    lines: z.array(CartLineSchema).min(1).max(30),
    gift: GiftSchema.nullable().optional(),
    /** The total the shopper saw; if prices or plans changed the API answers 409 with a fresh quote. */
    expectedTotalPaise: Money.optional(),
  })
  .meta({ id: "PlaceOrderRequest" });
export type PlaceOrderRequest = z.infer<typeof PlaceOrderRequestSchema>;

export const CheckoutConfigSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("razorpay"),
      keyId: z.string(),
      providerOrderId: z.string(),
      amountPaise: Money,
      currency: z.literal("INR"),
      name: z.string(),
      description: z.string(),
    }),
    z.object({
      kind: z.literal("fake"),
      providerOrderId: z.string(),
      amountPaise: Money,
      currency: z.literal("INR"),
    }),
  ])
  .meta({ id: "CheckoutConfig" });
export type CheckoutConfig = z.infer<typeof CheckoutConfigSchema>;

export const ShipmentEventSchema = z
  .object({
    status: ShipmentStatusSchema,
    label: z.string(),
    at: Instant,
    actor: ActorSchema,
    note: z.string().nullable(),
  })
  .meta({ id: "ShipmentEvent" });
export type ShipmentEvent = z.infer<typeof ShipmentEventSchema>;

export const ShipmentLineSchema = z
  .object({
    itemSlug: z.string(),
    itemName: z.string(),
    variantLabel: z.string(),
    quantity: z.number().int(),
    unitPricePaise: Money,
    tempClass: z.string(),
  })
  .meta({ id: "ShipmentLine" });

export const ShipmentDetailSchema = z
  .object({
    id: z.string(),
    sequence: z.number().int(),
    status: ShipmentStatusSchema,
    statusLabel: z.string(),
    timelinePosition: z.number().int().nullable(),
    vendor: VendorSummarySchema,
    dispatchDate: LocalDateString,
    promisedDeliveryDate: LocalDateString,
    usuallyArrivesOn: LocalDateString,
    orderCutoffAt: Instant,
    deliverByAt: Instant,
    mode: ShipModeSchema,
    carrierCode: z.string(),
    packagingCode: z.string(),
    awbNumber: z.string().nullable(),
    trackingUrl: z.string().nullable(),
    isAtRisk: z.boolean(),
    failureReason: FailureReasonSchema.nullable(),
    lines: z.array(ShipmentLineSchema),
    itemsTotalPaise: Money,
    shippingFeePaise: Money,
    packagingFeePaise: Money,
    canCancel: z.boolean(),
    timeline: z.array(ShipmentEventSchema),
  })
  .meta({ id: "ShipmentDetail" });
export type ShipmentDetail = z.infer<typeof ShipmentDetailSchema>;

export const PaymentInfoSchema = z
  .object({
    provider: z.string(),
    status: z.string(),
    method: z.string().nullable(),
    amountPaise: Money,
    refundedPaise: Money,
  })
  .meta({ id: "PaymentInfo" });

export const OrderDetailSchema = z
  .object({
    id: z.string(),
    orderNumber: z.string(),
    status: OrderStatusSchema,
    statusLabel: z.string(),
    createdAt: Instant,
    placedAt: Instant.nullable(),
    holdExpiresAt: Instant.nullable(),
    shipTo: ShipToSchema,
    isGift: z.boolean(),
    giftMessage: z.string().nullable(),
    senderName: z.string().nullable(),
    totals: QuoteTotalsSchema.omit({ isComplete: true }),
    shipments: z.array(ShipmentDetailSchema),
    payment: PaymentInfoSchema.nullable(),
    canCancel: z.boolean(),
  })
  .meta({ id: "OrderDetail" });
export type OrderDetail = z.infer<typeof OrderDetailSchema>;

export const OrderSummarySchema = z
  .object({
    id: z.string(),
    orderNumber: z.string(),
    status: OrderStatusSchema,
    statusLabel: z.string(),
    createdAt: Instant,
    grandTotalPaise: Money,
    itemCount: z.number().int(),
    headline: z.string(),
    destCity: z.string(),
    nextDeliveryDate: LocalDateString.nullable(),
  })
  .meta({ id: "OrderSummary" });
export type OrderSummary = z.infer<typeof OrderSummarySchema>;

export const PlaceOrderResponseSchema = z
  .object({
    order: OrderDetailSchema,
    checkout: CheckoutConfigSchema.nullable(),
  })
  .meta({ id: "PlaceOrderResponse" });
export type PlaceOrderResponse = z.infer<typeof PlaceOrderResponseSchema>;

export const VerifyPaymentRequestSchema = z
  .object({
    providerPaymentId: z.string().min(1),
    signature: z.string().min(1),
  })
  .meta({ id: "VerifyPaymentRequest" });

export const CLAIM_KIND_VALUES = ["SPOILED", "DAMAGED", "MISSING_ITEMS", "LATE", "OTHER"] as const;

export const CreateClaimRequestSchema = z
  .object({
    kind: z.enum(CLAIM_KIND_VALUES),
    description: z.string().trim().min(10).max(1000),
    photoUrls: z.array(z.url()).max(6).optional(),
  })
  .meta({ id: "CreateClaimRequest" });
export type CreateClaimRequest = z.infer<typeof CreateClaimRequestSchema>;

export const ClaimSchema = z
  .object({
    id: z.string(),
    shipmentId: z.string(),
    orderNumber: z.string(),
    kind: z.enum(CLAIM_KIND_VALUES),
    description: z.string(),
    photoUrls: z.array(z.string()),
    status: z.enum(["OPEN", "APPROVED", "REJECTED"]),
    resolution: z.enum(["REFUND", "RESHIP", "NONE"]).nullable(),
    refundPaise: Money,
    createdAt: Instant,
  })
  .meta({ id: "Claim" });
export type Claim = z.infer<typeof ClaimSchema>;
