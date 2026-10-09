/**
 * Where a kitchen's payout stands, and whether it may be released. A payout is the kitchen's
 * share of one delivered parcel (items total minus commission), held through the claim window.
 * Money only moves through a payment-provider transfer, so nothing is marked released unless
 * a transfer exists.
 */

export const PAYOUT_STATES = [
  "HELD_FOR_REVIEW",
  "WAITING_ON_CLAIM",
  "NEEDS_PAYOUT_ACCOUNT",
  "TRANSFER_FAILED",
  "IN_CLAIM_WINDOW",
  "TRANSFER_PENDING",
  "RELEASING",
  "RELEASED",
  "REVERSAL_PENDING",
  "CLAWED_BACK",
] as const;
export type PayoutState = (typeof PAYOUT_STATES)[number];

export const PAYOUT_STATE_LABELS: Record<PayoutState, string> = {
  HELD_FOR_REVIEW: "Held for review",
  WAITING_ON_CLAIM: "Waiting on a claim",
  NEEDS_PAYOUT_ACCOUNT: "Needs payout account",
  TRANSFER_FAILED: "Transfer failed",
  IN_CLAIM_WINDOW: "In claim window",
  TRANSFER_PENDING: "Transfer pending",
  RELEASING: "Releasing",
  RELEASED: "Paid",
  REVERSAL_PENDING: "Clawback pending",
  CLAWED_BACK: "Clawed back",
};

/** States someone in ops has to act on; the rest resolve by themselves. */
export const PAYOUT_ACTION_STATES: readonly PayoutState[] = [
  "HELD_FOR_REVIEW",
  "NEEDS_PAYOUT_ACCOUNT",
  "TRANSFER_FAILED",
  "REVERSAL_PENDING",
];

export interface PayoutFacts {
  status: "ON_HOLD" | "RELEASED" | "REVERSED";
  releaseAfter: Date;
  now: Date;
  heldReason: string | null;
  openClaim: boolean;
  accountLinked: boolean;
  /** A provider transfer exists (created on hold until the claim window closes). */
  transferred: boolean;
  /** The last attempt to create the transfer failed and was parked. */
  transferFailed: boolean;
  /** The provider confirmed the clawback of an existing transfer. */
  reversalRecorded: boolean;
}

/** The single most useful thing to say about a payout, in order of what blocks it. */
export function payoutState(f: PayoutFacts): PayoutState {
  if (f.status === "RELEASED") return "RELEASED";
  if (f.status === "REVERSED") {
    return f.transferred && !f.reversalRecorded ? "REVERSAL_PENDING" : "CLAWED_BACK";
  }
  if (f.heldReason) return "HELD_FOR_REVIEW";
  if (f.openClaim) return "WAITING_ON_CLAIM";
  if (!f.accountLinked) return "NEEDS_PAYOUT_ACCOUNT";
  if (f.transferFailed) return "TRANSFER_FAILED";
  if (f.now.getTime() < f.releaseAfter.getTime()) return "IN_CLAIM_WINDOW";
  if (!f.transferred) return "TRANSFER_PENDING";
  return "RELEASING";
}

/** Only a transferred payout past its window, with no claim or review hold, may be released. */
export function isReleasable(f: PayoutFacts): boolean {
  return payoutState(f) === "RELEASING";
}
