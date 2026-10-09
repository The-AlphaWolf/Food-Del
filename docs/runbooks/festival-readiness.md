# Festival readiness

Start three weeks before Diwali, Rakhi, Durga Puja, Eid or any expected peak.

## T-21 days
- [ ] Re-run the [load test](../load-test.md) against a Vercel preview at 10× last festival's peak hour.
- [ ] Kitchens confirm festival capacity. Update **daily parcel caps** and per-item **stock** on each kitchen and delicacy. The order book opens 30 days ahead, so check the dates already show.
- [ ] Courier: confirm festival pickup slots with Shiprocket for each origin city. Get the carriers' festival holiday list and add it as CARRIER blackouts on **Ops → Calendar**.
- [ ] Packaging and coolant stock at each kitchen for the forecast volume.

## T-7 days
- [ ] Freeze risky changes. Only fixes go to `main` until T+3.
- [ ] Supabase: check compute size and connection limits. Each server instance uses up to 5 pooled connections; see [load test](../load-test.md).
- [ ] Vercel: enable firewall rate rules for `/api/v1/orders` and `/api/v1/quotes` (see [security](../security.md)).
- [ ] Razorpay: check the account's refund balance and that Route transfers are enabled for every live kitchen. **Ops → Payouts** should have nothing in *Needs payout account*.
- [ ] Uptime monitor and Sentry alerts reach the on-call phone. Test it.
- [ ] On-call rota for the peak days, covering 7am–11pm IST.

## Peak days
- [ ] Morning: System health all **On schedule**, nothing parked.
- [ ] Every 2 hours: exception queue and at-risk parcels.
- [ ] After the evening order cutoff: confirm every kitchen's batch is locked and pickups are booked.

## T+3 days
- [ ] Claims backlog cleared. Payouts released and reconciled ([payout reconciliation](payout-reconciliation.md)).
- [ ] Review: peak orders/hour, p95 latency, failed parcels by reason, refunds. Feed the numbers into the next load test.
