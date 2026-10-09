# Pilot plan: three lanes into Diwali

M9 ends with a pilot on 2–3 lanes. This plan proposes which lanes, what has to be true before each step, what we measure, and when we stop. The dates assume today's state of the platform (9 Oct 2026) and Diwali on 8 Nov 2026. Moving Diwali in or out of the pilot is the main decision for the business; see "Decision needed" below.

## The lanes
| # | Lane | Mode | Why this one |
|---|---|---|---|
| 1 | **Kolkata → Bengaluru** | Air, chilled and ambient | The hardest case: milk sweets (nolen gur sandesh, baked rosogolla) with 3–4 day shelf life over 1,800 km, to a large Bengali community. If the cold chain and promise engine hold here, they hold anywhere. |
| 2 | **Hyderabad → Bengaluru** | Surface and air | Short haul and a mix of shelf-stable bakes (Karachi biscuits) and chilled items. Tests whether the planner picks surface correctly to keep fees low. |
| 3 | **Delhi NCR → Mumbai** | Surface, ambient | Ambient sweets and namkeen: the high-volume, low-risk gifting lane. A second destination city, so we learn last-mile behaviour beyond Bengaluru. |

Two lanes share Bengaluru so one city team can handle customer calls and failed deliveries for both.

**Scope controls (all in the ops console):**
- **Ops → Routes:** only these three origin→destination routes active.
- **Ops → Cities:** Bengaluru and Mumbai live as destinations. Other cities stay visible but say "not yet".
- **Ops → Kitchens:** two kitchens per origin, each with a conservative **daily parcel cap** (start at 20).

## Before we take a paid order
- [ ] **Kitchens signed:**
  - FSSAI licence on file (shown on every product page);
  - Razorpay Route account linked (**Ops → Payouts** shows nothing in *Needs payout account*);
  - prep and cutoff times agreed and entered.
- [ ] **Trial shipments, 2 per lane per mode, with temperature loggers.**
  - Chilled boxes must hold below 8 °C for the planned journey plus 25% margin.
  - Record actual transit hours. Correct `transit_hours_p50/p90` on the route if the seeded values are optimistic.
- [ ] **Production providers live:**
  - Supabase phone OTP (with CAPTCHA and OTP limits);
  - Razorpay live keys and webhook;
  - Shiprocket with pickup slots at each kitchen;
  - MSG91 DLT-approved templates;
  - WhatsApp templates approved.

  `ALLOW_DEMO_MODE` must be unset; production refuses to start otherwise.
- [ ] **Privacy and contacts:**
  - Grievance Officer appointed and `GRIEVANCE_OFFICER_NAME` / `GRIEVANCE_EMAIL` set;
  - `/privacy` reviewed by counsel ([privacy](privacy.md)).
- [ ] **Monitoring:**
  - uptime monitor on `/api/v1/health/ready` paging the on-call phone;
  - `SENTRY_DSN` set;
  - `OPS_PHONE` / `OPS_EMAIL` receive at-risk alerts.

  Test each one end to end ([monitoring](monitoring.md)).
- [ ] **Runbooks walked through** by everyone on the rota ([runbooks](runbooks/README.md)). Run one fire drill: fail a trial parcel on purpose and take it through refund.
- [ ] **Load test** against the production deployment at 10× the pilot's expected peak ([load test](load-test.md)).

## Timeline
| Dates | Phase | Who can order | Daily cap per kitchen |
|---|---|---|---|
| 12–23 Oct | Trial shipments, provider go-live, fire drill | Staff only (real money, refunded) | — |
| 26 Oct – 1 Nov | Friends & family | Invite list (~200 people) | 20 parcels |
| 2–10 Nov | **Diwali window** | Public, on the three lanes | 40, raised daily if metrics hold |
| 11–22 Nov | Steady state | Public | as set |
| 23 Nov | Review and decision on adding lanes | | |

## What we measure
Every number below comes from data the platform already records: parcels, claims, payouts, job runs and notifications.

| Metric | Target | Stop and fix if |
|---|---|---|
| Delivered by the promised date | ≥ 95% | < 90% on any lane over 3 days |
| Arrived spoiled or damaged (approved claims) | ≤ 2% of parcels | > 5% on any lane, or any food-safety complaint |
| Failed parcels (not delivered at all) | ≤ 1% | > 3% |
| Parcels flagged at risk that still arrived fresh | track | — |
| Payment success (captured ÷ checkout started) | ≥ 85% | < 70% |
| Kitchen payouts released on time (24 h after delivery) | 100% | any kitchen unpaid > 72 h |
| Contribution per order (price − kitchen share − shipping − packaging − refunds) | ≥ ₹0 by end of pilot | — (pricing input, not a stop rule) |
| Repeat purchase within the pilot | track | — |
| p95 API latency / readiness | per [load test](load-test.md) budgets / 99.9% | readiness failing > 15 min |

**Stop rules** are per lane:
- Pause the route on **Ops → Routes**.
- Open orders still get delivered or refunded.
- Fix the cause, then resume with a lower cap.

## Daily rhythm during the pilot
- **09:00:**
  - System health all on schedule;
  - exception queue reviewed;
  - yesterday's claims decided.
- **After each kitchen's cutoff:** batches locked, pickups booked, packaging photos received.
- **20:00:** at-risk parcels reviewed, and customers called before they call us.
- **Weekly:** payout reconciliation ([runbook](runbooks/payout-reconciliation.md)) and a metric review against the table above.

## Decision needed
**Run the public phase through Diwali (as above), or end the pilot before it?**
- **Through Diwali:** we see real festival demand and the hardest operating conditions (courier backlogs, holiday blackouts), at lower caps. The risk is that early mistakes happen in the most visible week.
- **Before Diwali:** a calmer pilot, but we learn little about the peak the business depends on, and the next comparable peak is Rakhi.

The plan recommends **through Diwali with caps**. The platform's capacity checks, blackouts and per-lane pause give ops the controls to keep that risk bounded.
