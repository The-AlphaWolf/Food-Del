# At-risk parcels

The *Check at-risk parcels* job (every 15 min) flags a parcel when its latest expected arrival, or the clock, has passed the point where the food would arrive with less freshness left than we promise. Ops gets an `OPS_AT_RISK` alert (SMS/WhatsApp/email to `OPS_PHONE` / `OPS_EMAIL`). Flagged parcels lead the **Exception queue** on the ops overview.

## For each flagged parcel
1. Open it from the exception queue: timeline, courier, AWB and the deadline it is racing.
2. **Call the courier** (AWB in hand). If it's at the destination hub and can go out today, push for that and note it on the parcel.
3. **Tell the customer** before they ask. Use the phone on the parcel, say what happened and what we're doing.
4. Decide, before the food actually spoils:

| Situation | Action in **Ops → Parcels** |
|---|---|
| Will still arrive inside its freshness window | Leave it. The flag clears on delivery. |
| Won't arrive in time, or courier lost it | Move to **Failed** with the reason (*Spoiled*, *Lost*, *Damaged*). The customer is refunded in full automatically. Undelivered parcels never create a kitchen payout. |
| Customer unreachable after failed attempts | **Failed → Undeliverable.** No refund (the food can't be resold); the customer can still raise a claim within 24 h of the attempt. |
| Kitchen never handed it over | **Failed → Vendor unfulfilled.** Full refund; the kitchen isn't paid. |

5. Where the lane allows, invite the customer to reorder for a later date. Their refund is already on its way.

## Many parcels at once
That's a lane or carrier problem, not a parcel problem. Go to [courier outage](courier-outage.md), and add a blackout so new orders stop promising that lane until it recovers.
