# Payments (Razorpay)

How money moves:
- **Checkout** creates a Razorpay order.
- **Payment.** The customer pays. Razorpay's webhook (`payment.captured`) confirms the order. The checkout page also verifies the payment signature directly, so a late webhook doesn't block the customer.
- **Hold expiry.** Unpaid orders release their stock after the hold expires (*Release unpaid holds* job, every 5 min). A payment that arrives **after** its hold expired is refunded in full automatically, because we can no longer promise the food.
- **Refunds** (claims, cancellations, failed parcels) are queued and sent by *Send queued work*.

## Customer paid, order still "Awaiting payment"
1. Find the order on **Ops → Parcels** (search the order number) and the payment in the Razorpay dashboard (search the order number in notes, or the customer's phone).
2. Razorpay shows **captured** but we don't: the webhook didn't arrive or was rejected.
   - Razorpay → Webhooks → our endpoint → recent deliveries. A `401` means `RAZORPAY_WEBHOOK_SECRET` doesn't match: fix it in Vercel and redeploy.
   - Resend the event from Razorpay once fixed. Handling is idempotent; resending is safe.
3. Razorpay shows **failed / created**: the customer didn't complete payment. If they were charged, it's a bank-side auto-reversal (5–7 days); tell them so.

## Refunds not going out
- **System health → Parked after retries** shows `payment.refund` counts. Refunds retry with backoff for 8 attempts (about 6 hours), then park.
- The error is in Sentry ("outbox message parked…").
- Common causes:
  - **Razorpay balance too low for refunds.** Top up, then on the System health panel press **Run now** on *Send queued work*. Parked messages need to be set back to pending; see below.
  - **Payment already fully refunded on the Razorpay dashboard by hand.** Never refund by hand in Razorpay; it bypasses our records. If it happened, mark our refund as processed (ask an engineer).
- **Re-queue parked work** after fixing the cause. Engineer, SQL on the primary:
  `update outbox set status='PENDING', attempts=0, available_at=now() where status='FAILED' and topic='payment.refund';`

## Payments failing for everyone
- Check status.razorpay.com.
- Pause new orders while it's down: **Ops → Calendar → add blackout**, scope National, today and tomorrow. Remove it when Razorpay recovers.
- Customers with an order already in checkout get their stock back when the hold expires.
- Readiness stays green. This only shows as *Last payment captured* going stale on System health during trading hours.
