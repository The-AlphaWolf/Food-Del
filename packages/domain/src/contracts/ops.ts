import { z } from "zod";
import { CITY_LAUNCH_STATUSES } from "../geo";
import {
  FailureReasonSchema,
  Instant,
  LocalDateString,
  Money,
  ShipModeSchema,
  ShipmentStatusSchema,
} from "./common";

export const OpsShipmentRowSchema = z
  .object({
    id: z.string(),
    orderId: z.string(),
    orderNumber: z.string(),
    status: ShipmentStatusSchema,
    statusLabel: z.string(),
    vendorName: z.string(),
    originCity: z.string(),
    destCity: z.string(),
    destPincode: z.string(),
    mode: ShipModeSchema,
    carrierCode: z.string(),
    awbNumber: z.string().nullable(),
    dispatchDate: LocalDateString,
    promisedDeliveryDate: LocalDateString,
    deliverByAt: Instant,
    latestEtaAt: Instant.nullable(),
    isAtRisk: z.boolean(),
    failureReason: FailureReasonSchema.nullable(),
    hoursToSpoilage: z.number(),
    itemsTotalPaise: Money,
  })
  .meta({ id: "OpsShipmentRow" });
export type OpsShipmentRow = z.infer<typeof OpsShipmentRowSchema>;

export const OpsOverviewSchema = z
  .object({
    asOf: Instant,
    counts: z.object({
      awaitingPayment: z.number().int(),
      placed: z.number().int(),
      inKitchen: z.number().int(),
      inFlight: z.number().int(),
      atRisk: z.number().int(),
      deliveryAttemptsFailed: z.number().int(),
      deliveredLast7d: z.number().int(),
      failedLast7d: z.number().int(),
      openClaims: z.number().int(),
      outboxPending: z.number().int(),
      outboxFailed: z.number().int(),
    }),
    gmvLast7dPaise: Money,
    onTimeRateLast30d: z.number().nullable(),
    exceptions: z.array(OpsShipmentRowSchema),
  })
  .meta({ id: "OpsOverview" });
export type OpsOverview = z.infer<typeof OpsOverviewSchema>;

export const OpsTransitionRequestSchema = z
  .object({
    to: ShipmentStatusSchema,
    failureReason: FailureReasonSchema.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .meta({ id: "OpsTransitionRequest" });
export type OpsTransitionRequest = z.infer<typeof OpsTransitionRequestSchema>;

export const ResolveClaimRequestSchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    resolution: z.enum(["REFUND", "RESHIP", "NONE"]),
    refundPaise: Money.min(0).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .meta({ id: "ResolveClaimRequest" });
export type ResolveClaimRequest = z.infer<typeof ResolveClaimRequestSchema>;

export const BLACKOUT_SCOPE_VALUES = ["NATIONAL", "CITY", "VENDOR", "CARRIER"] as const;

export const BlackoutSchema = z
  .object({
    id: z.string(),
    scope: z.enum(BLACKOUT_SCOPE_VALUES),
    scopeRef: z.string(),
    scopeLabel: z.string(),
    date: LocalDateString,
    reason: z.string(),
  })
  .meta({ id: "Blackout" });
export type Blackout = z.infer<typeof BlackoutSchema>;

export const BlackoutInputSchema = z
  .object({
    scope: z.enum(BLACKOUT_SCOPE_VALUES),
    scopeRef: z.string().default(""),
    date: LocalDateString,
    reason: z.string().trim().min(3).max(120),
  })
  .meta({ id: "BlackoutInput" });
export type BlackoutInput = z.infer<typeof BlackoutInputSchema>;

export const OpsCitySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    stateCode: z.string(),
    isOrigin: z.boolean(),
    isDestination: z.boolean(),
    launchStatus: z.enum(CITY_LAUNCH_STATUSES),
    pincodes: z.number().int(),
    vendors: z.number().int(),
    lanesFrom: z.number().int(),
  })
  .meta({ id: "OpsCity" });
export type OpsCity = z.infer<typeof OpsCitySchema>;

export const UpdateCityRequestSchema = z
  .object({
    launchStatus: z.enum(CITY_LAUNCH_STATUSES).optional(),
    isOrigin: z.boolean().optional(),
    isDestination: z.boolean().optional(),
  })
  .meta({ id: "UpdateCityRequest" });
export type UpdateCityRequest = z.infer<typeof UpdateCityRequestSchema>;

export const OpsVendorSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    city: z.string(),
    status: z.enum(["ONBOARDING", "ACTIVE", "PAUSED", "OFFBOARDED"]),
    fssaiLicenseNo: z.string(),
    fssaiValidUntil: LocalDateString,
    fssaiExpiringSoon: z.boolean(),
    commissionBps: z.number().int(),
    dailyShipmentCap: z.number().int(),
    activeItems: z.number().int(),
    shipmentsLast30d: z.number().int(),
    failureRateLast30d: z.number().nullable(),
  })
  .meta({ id: "OpsVendor" });
export type OpsVendor = z.infer<typeof OpsVendorSchema>;

export const UpdateVendorRequestSchema = z
  .object({
    status: z.enum(["ONBOARDING", "ACTIVE", "PAUSED", "OFFBOARDED"]).optional(),
    commissionBps: z.number().int().min(0).max(10_000).optional(),
    dailyShipmentCap: z.number().int().min(0).max(10_000).optional(),
  })
  .meta({ id: "UpdateVendorRequest" });
export type UpdateVendorRequest = z.infer<typeof UpdateVendorRequestSchema>;

export const JOB_NAMES = [
  "lock-batches",
  "expire-holds",
  "monitor-at-risk",
  "release-payouts",
  "materialize-slots",
  "process-outbox",
  "housekeeping",
] as const;
export const JobNameSchema = z.enum(JOB_NAMES).meta({ id: "JobName" });
export type JobName = z.infer<typeof JobNameSchema>;

export const JobResultSchema = z
  .object({ job: JobNameSchema, processed: z.number().int(), detail: z.unknown().optional() })
  .meta({ id: "JobResult" });
export type JobResult = z.infer<typeof JobResultSchema>;
