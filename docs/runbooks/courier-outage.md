# Courier outage (Shiprocket and its carriers)

Symptoms:
- *Last courier update* on System health is hours old during trading hours.
- Parked `carrier.book` work on System health.
- Kitchens report no pickup or no label.

## Bookings failing
1. **System health → Parked after retries** shows `carrier.book`. Sentry has the error text.
   - `401`/`403`: Shiprocket credentials expired or the password changed. Update `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD` in Vercel and redeploy.
   - Shiprocket down (status page, or timeouts): wait. Bookings retry automatically with backoff for about 6 hours before parking.
2. **Kitchens pack at their usual time regardless.** A parcel that is packed but unbooked is at risk. Before the courier pickup cutoff for the day, decide:
   - **Book by hand** in the Shiprocket panel and enter the AWB with the kitchen. Tell engineering so tracking can be linked.
   - **Don't dispatch.** Mark each parcel *Failed* with reason *Vendor unfulfilled* (the customer gets a full refund, and the kitchen isn't paid for it). Better than shipping a chilled parcel that will miss its window.

## No tracking updates
- Webhook deliveries: Shiprocket → Settings → Webhooks. A `401` means `SHIPROCKET_WEBHOOK_TOKEN` doesn't match.
- Updates resume once fixed. Late or out-of-order updates are ignored when they would move a parcel backwards.

## One carrier down in one city
- Add a CARRIER blackout for that carrier and the affected dates on **Ops → Calendar**. Planning then routes new orders over other lanes or later dates.
- Parcels already with that carrier: watch them in [at-risk parcels](at-risk-parcels.md).
