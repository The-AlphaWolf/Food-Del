import { z } from "zod";
import { DIETS, TEMP_CLASSES } from "../catalog";
import { PINCODE_RE } from "../geo";
import { ORDER_STATUSES } from "../order-state/order";
import { ACTORS, FAILURE_REASONS, SHIPMENT_STATUSES } from "../order-state/shipment";
import { SHIP_MODES } from "../pricing/rates";
import { ALL_REASON_CODES } from "../serviceability/reasons";
import { isLocalDate } from "../time/ist";

export const Pincode = z
  .string()
  .regex(PINCODE_RE, "Enter a valid 6-digit pincode")
  .meta({ id: "Pincode", example: "560001" });

export const LocalDateString = z
  .string()
  .refine(isLocalDate, "Expected a date as YYYY-MM-DD")
  .meta({ id: "LocalDate", description: "Calendar date in IST", example: "2026-10-16" });

export const Instant = z.string().meta({
  id: "Instant",
  description: "ISO-8601 timestamp (UTC)",
  example: "2026-10-15T10:30:00.000Z",
});

export const Money = z
  .number()
  .int()
  .meta({ id: "Paise", description: "Amount in paise (₹1 = 100)", example: 64900 });

export const Uuid = z.uuid();

export const TempClassSchema = z.enum(TEMP_CLASSES).meta({ id: "TempClass" });
export const DietSchema = z.enum(DIETS).meta({ id: "Diet" });
export const ShipModeSchema = z.enum(SHIP_MODES).meta({ id: "ShipMode" });
export const ShipmentStatusSchema = z.enum(SHIPMENT_STATUSES).meta({ id: "ShipmentStatus" });
export const OrderStatusSchema = z.enum(ORDER_STATUSES).meta({ id: "OrderStatus" });
export const FailureReasonSchema = z.enum(FAILURE_REASONS).meta({ id: "FailureReason" });
export const ActorSchema = z.enum(ACTORS).meta({ id: "Actor" });
export const ReasonCodeSchema = z
  .enum(ALL_REASON_CODES as [string, ...string[]])
  .meta({ id: "ReasonCode", description: "Why something cannot be delivered or planned" });

export const ROLE_VALUES = ["CUSTOMER", "VENDOR_OWNER", "VENDOR_STAFF", "OPS", "ADMIN"] as const;
export const RoleSchema = z.enum(ROLE_VALUES).meta({ id: "Role" });
export type Role = z.infer<typeof RoleSchema>;

/** RFC 9457 problem details, with a stable machine-readable `code`. */
export const ProblemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    code: z.string(),
    detail: z.string().optional(),
    details: z.unknown().optional(),
  })
  .meta({ id: "Problem" });
export type Problem = z.infer<typeof ProblemSchema>;

export const CityRef = z.object({ slug: z.string(), name: z.string() }).meta({ id: "CityRef" });
