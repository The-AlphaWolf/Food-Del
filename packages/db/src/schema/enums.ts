/**
 * Postgres enums. Values come from `@food-del/domain` so the database, the engines and the API
 * can never disagree about a status or class.
 */
import {
  ACTORS,
  CITY_LAUNCH_STATUSES,
  COOLANTS,
  DIETS,
  FAILURE_REASONS,
  ORDER_STATUSES,
  SHIP_MODES,
  SHIPMENT_STATUSES,
  TEMP_CLASSES,
} from "@food-del/domain";
import { pgEnum } from "drizzle-orm/pg-core";

export const tempClassEnum = pgEnum("temp_class", TEMP_CLASSES);
export const shipModeEnum = pgEnum("ship_mode", SHIP_MODES);
export const dietEnum = pgEnum("diet", DIETS);
export const coolantEnum = pgEnum("coolant", COOLANTS);
export const cityLaunchStatusEnum = pgEnum("city_launch_status", CITY_LAUNCH_STATUSES);
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);
export const shipmentStatusEnum = pgEnum("shipment_status", SHIPMENT_STATUSES);
export const failureReasonEnum = pgEnum("failure_reason", FAILURE_REASONS);
export const actorEnum = pgEnum("actor", ACTORS);

export const VENDOR_STATUSES = ["ONBOARDING", "ACTIVE", "PAUSED", "OFFBOARDED"] as const;
export const vendorStatusEnum = pgEnum("vendor_status", VENDOR_STATUSES);

export const FULFILLMENT_MODES = ["VENDOR_PACKED", "HUB_PACKED"] as const;
export const fulfillmentModeEnum = pgEnum("fulfillment_mode", FULFILLMENT_MODES);

export const ITEM_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
export const itemStatusEnum = pgEnum("item_status", ITEM_STATUSES);

export const LANE_SOURCES = ["CARRIER_FEED", "MANUAL", "OBSERVED"] as const;
export const laneSourceEnum = pgEnum("lane_source", LANE_SOURCES);

export const BLACKOUT_SCOPES = ["NATIONAL", "CITY", "VENDOR", "CARRIER"] as const;
export const blackoutScopeEnum = pgEnum("blackout_scope", BLACKOUT_SCOPES);

export const BATCH_STATUSES = [
  "OPEN",
  "LOCKED",
  "IN_PRODUCTION",
  "PACKED",
  "HANDED_OVER",
  "CLOSED",
] as const;
export const batchStatusEnum = pgEnum("batch_status", BATCH_STATUSES);

export const PAYMENT_PROVIDERS = ["RAZORPAY", "FAKE"] as const;
export const paymentProviderEnum = pgEnum("payment_provider", PAYMENT_PROVIDERS);

export const PAYMENT_STATUSES = [
  "CREATED",
  "CAPTURED",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;
export const paymentStatusEnum = pgEnum("payment_status", PAYMENT_STATUSES);

export const REFUND_STATUSES = ["PENDING", "PROCESSED", "FAILED"] as const;
export const refundStatusEnum = pgEnum("refund_status", REFUND_STATUSES);

export const PAYOUT_STATUSES = ["ON_HOLD", "RELEASED", "REVERSED"] as const;
export const payoutStatusEnum = pgEnum("payout_status", PAYOUT_STATUSES);

export const CLAIM_KINDS = ["SPOILED", "DAMAGED", "MISSING_ITEMS", "LATE", "OTHER"] as const;
export const claimKindEnum = pgEnum("claim_kind", CLAIM_KINDS);

export const CLAIM_STATUSES = ["OPEN", "APPROVED", "REJECTED"] as const;
export const claimStatusEnum = pgEnum("claim_status", CLAIM_STATUSES);

export const CLAIM_RESOLUTIONS = ["REFUND", "RESHIP", "NONE"] as const;
export const claimResolutionEnum = pgEnum("claim_resolution", CLAIM_RESOLUTIONS);

export const ROLES = ["CUSTOMER", "VENDOR_OWNER", "VENDOR_STAFF", "OPS", "ADMIN"] as const;
export const roleEnum = pgEnum("role", ROLES);

export const OUTBOX_STATUSES = ["PENDING", "DONE", "FAILED"] as const;
export const outboxStatusEnum = pgEnum("outbox_status", OUTBOX_STATUSES);
