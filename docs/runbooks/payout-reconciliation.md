# Payout reconciliation

Kitchens are paid by Razorpay Route transfers created when a parcel is delivered. Transfers are held at Razorpay until the 24-hour claim window closes; then the *Release payouts* job (hourly) lifts the hold. Approved claims reverse the transfer. Background: [ADR 0005](../adr/0005-payouts-move-only-through-transfers.md).

## Weekly (finance)
1. **Ops → Payouts → Statement** for the week. One CSV line per payout with:
   - amounts in rupees;
   - state;
   - the Razorpay transfer id and reversal id.
2. Razorpay → Route → Transfers export for the same dates.
3. Match on transfer id:
   - **Paid** in ours must be *settled* (hold released) in Razorpay.
   - **Clawed back** in ours must show a reversal with the same reversal id.
   - Anything in Razorpay without a line in ours was made by hand. Find out who made it, and never do it again: manual transfers bypass claim holds.

## "Stuck until someone acts" on the payouts screen
| State | Fix |
|---|---|
| **Needs payout account** | The kitchen has no Razorpay Route account linked. Link it on **Ops → Kitchens → (kitchen) → Edit**. Everything it is owed is queued automatically. |
| **Transfer failed** | The row shows the error. Usually the payment wasn't captured, or Route account KYC is incomplete. Fix the cause, then **Retry** on the row. |
| **Held for review** | Someone paused it with a reason. Resolve the complaint, then **Resume**, or approve a claim (which claws it back). |
| **Clawback pending** for more than an hour | The reversal is queued but failing. Check parked `payout.reverse` work on System health and Sentry for the error. |

## A kitchen says it wasn't paid
Search the order number on **Ops → Payouts**. The state names what's blocking it. If it says **Paid**, give the kitchen the transfer id. Razorpay settles Route transfers to their bank on its own schedule (usually T+2 working days).
