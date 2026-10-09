import { z } from "zod";
import {
  CityRef,
  Instant,
  LocalDateString,
  Money,
  Pincode,
  ReasonCodeSchema,
  ShipModeSchema,
  TempClassSchema,
} from "./common";

export const PincodeLookupSchema = z
  .object({
    pincode: z.string(),
    serviceable: z.boolean(),
    reason: ReasonCodeSchema.nullable(),
    message: z.string().nullable(),
    city: CityRef.nullable(),
    district: z.string().nullable(),
    stateCode: z.string().nullable(),
    isOda: z.boolean(),
  })
  .meta({ id: "PincodeLookup" });
export type PincodeLookup = z.infer<typeof PincodeLookupSchema>;

export const PlanSummarySchema = z
  .object({
    dispatchDate: LocalDateString,
    promisedDeliveryDate: LocalDateString,
    usuallyArrivesOn: LocalDateString,
    orderCutoffAt: Instant,
    deliverByAt: Instant,
    mode: ShipModeSchema,
    carrierCode: z.string(),
    packagingCode: z.string(),
    packagingName: z.string(),
    coldChain: z.boolean(),
    shippingFeePaise: Money,
    packagingFeePaise: Money,
    freshnessMarginHours: z.number(),
    remainingUnits: z.number().int(),
  })
  .meta({ id: "PlanSummary" });
export type PlanSummary = z.infer<typeof PlanSummarySchema>;

export const CalendarDaySchema = z
  .object({
    date: LocalDateString,
    plan: PlanSummarySchema.nullable(),
    reason: ReasonCodeSchema.nullable(),
    message: z.string().nullable(),
  })
  .meta({ id: "CalendarDay" });
export type CalendarDay = z.infer<typeof CalendarDaySchema>;

export const AvailabilityQuerySchema = z.object({
  pincode: Pincode,
  variantId: z.string().min(1),
  qty: z.coerce.number().int().min(1).max(20).optional(),
  days: z.coerce.number().int().min(1).max(31).optional(),
});
export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;

export const AvailabilitySchema = z
  .object({
    variantId: z.string(),
    pincode: z.string(),
    tempClass: TempClassSchema,
    earliest: PlanSummarySchema.nullable(),
    reason: ReasonCodeSchema.nullable(),
    message: z.string().nullable(),
    days: z.array(CalendarDaySchema),
  })
  .meta({ id: "Availability" });
export type Availability = z.infer<typeof AvailabilitySchema>;
