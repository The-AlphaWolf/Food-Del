import { z } from "zod";
import { VendorSummarySchema } from "./catalog";
import {
  Instant,
  LocalDateString,
  Money,
  ShipModeSchema,
  ShipmentStatusSchema,
  TempClassSchema,
} from "./common";

export const VendorShipmentSchema = z
  .object({
    id: z.string(),
    orderNumber: z.string(),
    status: ShipmentStatusSchema,
    statusLabel: z.string(),
    packagingCode: z.string(),
    packagingName: z.string(),
    coolant: z.string(),
    mode: ShipModeSchema,
    carrierCode: z.string(),
    promisedDeliveryDate: LocalDateString,
    deliverByAt: Instant,
    destCity: z.string(),
    destPincode: z.string(),
    recipientName: z.string(),
    isGift: z.boolean(),
    lines: z.array(
      z.object({ itemName: z.string(), variantLabel: z.string(), quantity: z.number().int() }),
    ),
    awbNumber: z.string().nullable(),
    labelUrl: z.string().nullable(),
    canPack: z.boolean(),
    canReportShortfall: z.boolean(),
  })
  .meta({ id: "VendorShipment" });
export type VendorShipment = z.infer<typeof VendorShipmentSchema>;

export const ProductionLineSchema = z
  .object({
    variantId: z.string(),
    itemName: z.string(),
    variantLabel: z.string(),
    tempClass: TempClassSchema,
    quantity: z.number().int(),
  })
  .meta({ id: "ProductionLine" });

export const VendorDaySchema = z
  .object({
    vendor: VendorSummarySchema,
    date: LocalDateString,
    orderCutoffAt: Instant,
    readyForPickupLocal: z.string(),
    isLocked: z.boolean(),
    batches: z.array(
      z.object({
        id: z.string(),
        carrierCode: z.string(),
        status: z.string(),
        pickupRef: z.string().nullable(),
      }),
    ),
    production: z.array(ProductionLineSchema),
    packagingNeeded: z.array(
      z.object({ code: z.string(), name: z.string(), count: z.number().int() }),
    ),
    shipments: z.array(VendorShipmentSchema),
    counts: z.object({
      total: z.number().int(),
      packed: z.number().int(),
      handedOver: z.number().int(),
    }),
  })
  .meta({ id: "VendorDay" });
export type VendorDay = z.infer<typeof VendorDaySchema>;

export const VendorOverviewSchema = z
  .object({
    vendor: VendorSummarySchema,
    upcoming: z.array(
      z.object({
        date: LocalDateString,
        shipments: z.number().int(),
        units: z.number().int(),
        cutoffAt: Instant,
        /** The kitchen doesn't dispatch this day (weekly off or holiday). */
        closed: z.boolean(),
      }),
    ),
    payouts: z.object({
      onHoldPaise: Money,
      releasedPaise: Money,
      /** Without a linked Razorpay Route account, held payouts can't be paid out. */
      accountLinked: z.boolean(),
    }),
  })
  .meta({ id: "VendorOverview" });
export type VendorOverview = z.infer<typeof VendorOverviewSchema>;

export const InventoryCellSchema = z.object({
  date: LocalDateString,
  capacity: z.number().int(),
  reserved: z.number().int(),
  sold: z.number().int(),
});

export const InventoryGridSchema = z
  .object({
    vendorId: z.string(),
    dates: z.array(LocalDateString),
    rows: z.array(
      z.object({
        variantId: z.string(),
        itemName: z.string(),
        variantLabel: z.string(),
        defaultDailyCap: z.number().int(),
        cells: z.array(InventoryCellSchema.nullable()),
      }),
    ),
  })
  .meta({ id: "InventoryGrid" });
export type InventoryGrid = z.infer<typeof InventoryGridSchema>;

export const InventoryUpdateRequestSchema = z
  .object({
    cells: z
      .array(
        z.object({
          variantId: z.string(),
          date: LocalDateString,
          capacity: z.number().int().min(0).max(10_000),
        }),
      )
      .min(1)
      .max(500),
  })
  .meta({ id: "InventoryUpdateRequest" });
export type InventoryUpdateRequest = z.infer<typeof InventoryUpdateRequestSchema>;

export const PackRequestSchema = z
  .object({
    /** When the food was actually made, if earlier than planned (recomputes the spoilage deadline). */
    preparedAt: Instant.optional(),
  })
  .meta({ id: "PackRequest" });

export const ShortfallRequestSchema = z
  .object({ note: z.string().trim().min(3).max(500) })
  .meta({ id: "ShortfallRequest" });
