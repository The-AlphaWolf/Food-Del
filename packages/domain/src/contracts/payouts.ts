import { z } from "zod";
import { PAYOUT_STATES } from "../payouts";
import { Instant, LocalDateString, Money } from "./common";

export const PayoutStateSchema = z.enum(PAYOUT_STATES).meta({ id: "PayoutState" });

/** One kitchen's share of one delivered parcel. */
export const PayoutRowSchema = z
  .object({
    id: z.string(),
    orderId: z.string(),
    orderNumber: z.string(),
    shipmentId: z.string(),
    kitchen: z.object({ id: z.string(), name: z.string(), city: z.string() }),
    grossPaise: Money,
    commissionPaise: Money,
    netPaise: Money,
    status: z.enum(["ON_HOLD", "RELEASED", "REVERSED"]),
    state: PayoutStateSchema,
    needsAction: z.boolean(),
    deliveredAt: Instant.nullable(),
    releaseAfter: Instant,
    releasedAt: Instant.nullable(),
    reversedAt: Instant.nullable(),
    heldReason: z.string().nullable(),
    heldAt: Instant.nullable(),
    openClaimId: z.string().nullable(),
    transferId: z.string().nullable(),
    transferError: z.string().nullable(),
    reversalId: z.string().nullable(),
    createdAt: Instant,
  })
  .meta({ id: "PayoutRow" });
export type PayoutRow = z.infer<typeof PayoutRowSchema>;

export const PayoutListQuerySchema = z
  .object({
    /** A payout state, or NEEDS_ACTION for everything ops has to act on. */
    state: z.union([PayoutStateSchema, z.literal("NEEDS_ACTION")]).optional(),
    vendorId: z.uuid().optional(),
    /** Order number or kitchen name. */
    q: z.string().trim().max(60).optional(),
    /** Payouts created (parcel delivered) on or after this IST date. */
    from: LocalDateString.optional(),
    /** …and on or before this one. */
    to: LocalDateString.optional(),
  })
  .meta({ id: "PayoutListQuery" });
export type PayoutListQuery = z.infer<typeof PayoutListQuerySchema>;

const Tally = z.object({ count: z.number().int(), netPaise: Money });

export const PayoutSummarySchema = z
  .object({
    period: z.object({ from: LocalDateString, to: LocalDateString }),
    /** Not yet paid out, whatever the reason. */
    owed: Tally,
    /** Owed, and stuck until someone acts (review hold, missing account, failed transfer…). */
    needsAction: Tally,
    /** Paid out during the period. */
    paid: Tally,
    /** Clawed back after approved claims during the period. */
    clawedBack: Tally,
    /** Platform commission on parcels delivered in the period, net of clawbacks. */
    commissionPaise: Money,
    kitchens: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        city: z.string(),
        accountLinked: z.boolean(),
        owedPaise: Money,
        needsAction: z.number().int(),
        paidPaise: Money,
        clawedBackPaise: Money,
        commissionPaise: Money,
      }),
    ),
  })
  .meta({ id: "PayoutSummary" });
export type PayoutSummary = z.infer<typeof PayoutSummarySchema>;

export const HoldPayoutRequestSchema = z
  .object({ reason: z.string().trim().min(3).max(200) })
  .meta({ id: "HoldPayoutRequest" });
export type HoldPayoutRequest = z.infer<typeof HoldPayoutRequestSchema>;
