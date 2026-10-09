# ADR 0005: Kitchen payouts move only through provider transfers

- **Status:** Accepted
- **Date:** 2026-10-10

## Context
Each delivered parcel creates a payout: the kitchen's share (items total minus commission), held until the 24-hour claim window closes. The first version had four gaps:

1. **"Released" without payment.** If a kitchen had no Razorpay Route account when its parcel was delivered, no transfer was created. The release job still marked the payout `RELEASED`, so reports said the kitchen was paid when no money had moved. Linking the account later didn't help either.
2. **Holds that weren't really holds.** Transfers were created with `on_hold_until` set to the end of the claim window, so Razorpay would settle them on that date regardless of an open claim.
3. **Clawbacks that didn't claw back.** An approved claim marked the payout `REVERSED`, but any transfer already routed to the kitchen (on hold) stayed in its account.
4. **No way to pause.** Ops couldn't stop one payout while looking into a complaint.

## Decision
- **A payout's state is derived, never guessed.** `payoutState()` in `@food-del/domain` names what blocks each payout, in this order:
  - held for review
  - waiting on a claim
  - needs a payout account
  - transfer failed
  - in claim window
  - transfer pending
  - releasing

  Settled payouts are *paid*, *clawback pending* or *clawed back*.
- **Transfers are held indefinitely at Razorpay.** They are created with `on_hold: true` and no `on_hold_until`. With a date set, Razorpay settles automatically on that date even if a claim is open or ops has held the payout. Only our release job settles a transfer, by lifting the hold.
- **Release requires a transfer.** The release job releases only payouts that have a provider transfer. A due payout without one gets its transfer queued (when the kitchen has an account) and is released on a later run.
- **Linking an account sends what's owed.** Saving a kitchen's payout account queues transfers for every held payout that doesn't have one.
- **Clawbacks reverse the money.** Approving a refund claim marks the payout `REVERSED` and, if a transfer exists, queues `payout.reverse`. That calls Razorpay's transfer reversals API and records the reversal id; until then the payout shows as *clawback pending*.
- **Transfer failures stay visible.** A transfer that can't be made (e.g. no captured payment) retries with backoff, then is parked as failed and shown to ops with its error, instead of silently doing nothing. Ops retries it from the payouts screen once the cause is fixed.
- **Review holds.** `held_reason` / `held_at` pause a payout (the release job skips it) without clawing anything back. Resuming continues the normal schedule.
- **Statement.** `/v1/ops/payouts/statement` exports one CSV line per payout, with amounts in rupees and the provider transfer and reversal ids, for reconciling with Razorpay settlements.

## Consequences
- What the payouts screen shows as *paid* matches what Razorpay paid.
- Payouts for kitchens without accounts accumulate as *needs payout account* and appear in "stuck until someone acts" until ops links the account.
- Migration `0002_payout_review_and_reversals` adds the hold and reversal columns and a per-kitchen index. Deployments must run migrations before the new code serves traffic.
