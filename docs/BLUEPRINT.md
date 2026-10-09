# Food-Del: Product & Technical Blueprint

> A cross-city delicacy delivery platform for India. It ships iconic regional foods (sweets, bakes, namkeen, regional specials) from their origin city to customers in other cities, with scheduled pre-orders, batch dispatch and passive cold chain.
>
> **Status:** Approved (Phase 1 decisions confirmed: see §6).
> **Delivery model:** Web first (responsive Next.js PWA), mobile ready (Expo in Phase 2) with no rewrite.

---

## 1. Product strategy

### 1.1 Why this isn't Swiggy

| | Hyper-local (Swiggy/Zomato) | Cross-city delicacies (Food-Del) |
|---|---|---|
| Unit of time | Minutes | Days. The customer picks the delivery date. |
| Supply | Effectively unlimited, cooked on demand | Fixed daily production caps, made to order for a dispatch date |
| Binding constraint | Rider availability | Shelf life against p90 transit time, plus packaging hold time |
| Failed delivery | Re-deliver | The food is lost. No return to origin (RTO) for perishables. |
| Cost structure | Rider fee | Air freight on volumetric weight + insulated packaging + coolant. This needs a high order value, so the product leads with gifting. |

**Lesson from Zomato:** Zomato ran "Intercity Legends" from 2022 and shut it in August 2024, citing no product-market fit. The economics of air-shipped cooked food were the core problem. Food-Del therefore launches by risk tier:

- **Tier A (launch):** ambient, shelf life of 7 days or more. Dry mithai, namkeen, bakery, pickles, canned rosogolla. Air or surface.
- **Tier B (launch, metro↔metro air only):** chilled, 2–5 days. Sandesh, kalakand. Gel-PCM boxes. Only after logger-validated packaging trials on each lane in summer conditions.
- **Tier C (Phase 3):** frozen or cooked meals such as biryani, kebabs and haleem. Dry ice is dangerous goods for air (UN1845).

### 1.2 Geography

A city can be an **origin** (vendors ship from it), a **destination** (customers receive in it), or both. Adding a destination is cheap (pincode data). Adding an origin is expensive (vendors, packaging kits, courier pickups).

- **Origins at launch:** Kolkata, Hyderabad, Delhi NCR, Bengaluru.
- **Destinations at launch:** Delhi NCR, Mumbai, Bengaluru, Hyderabad, Chennai, Kolkata, Pune.
- **Same-city delivery is excluded.** That's a hyper-local problem.
- **City expansion is data-only:** cities, pincodes, lanes and blackout dates. Never a deploy.

---

## 2. Phase 1 web MVP scope

### 2.1 Customer discovery
- Destination first (pincode or city), which filters what can reach the customer. Then browse by origin city. The choice persists.
- Categories: Mithai (dry), Mithai (milk-based, chilled), Namkeen & snacks, Bakery, Pickles & preserves, Regional specials, Festive gifting.
- Item cards: origin badge, freshness indicator ("Stays fresh 4 days · Chilled"), FSSAI veg/egg/non-veg mark, earliest delivery to the customer's pincode, scarcity ("12 left for Friday dispatch").
- Delivery-date calendar (next 14–21 days). Dates that can't be served are greyed out with the reason.
- SEO pages per origin, item and destination (`/send/kolkata-sandesh-to-bengaluru`).
- Mobile-first PWA. LCP under 2.5 s on 4G mid-range Android.

### 2.2 Ordering & checkout
- Serviceability check on the item page, in the cart, and again at payment capture. The server is authoritative.
- Cart grouped by shipment: "Ships from Kolkata · Dispatch Wed · Arrives by Thu · Insulated 24h box".
- Per-shipment packaging and shipping fees. Prices are GST-inclusive.
- "Arrives by" uses p90 transit. "Usually arrives" uses p50.
- Gifting: recipient name and phone (the recipient gets updates too), message, invoice without prices.
- Phone-OTP login. **Prepaid only** (UPI, cards, netbanking). No COD, because a refused perishable is a total loss.
- Free cancellation until the vendor's cutoff, then locked.
- Tracking timeline with a freshness clock. Updates go out by WhatsApp, SMS and email.

### 2.3 Vendor portal (mobile-first PWA)
- Orders by dispatch date, with a countdown to the cutoff.
- Inventory: per-variant daily cap calendar, pause an item, closures.
- Batches: production sheet (total per SKU), packing list (box type and coolant count), tracking number (AWB) and 4×6 label, mark packed (optional photo), dispatch manifest PDF.
- Payouts: held until delivery plus the claim window.

### 2.4 Admin / ops console
- Cities, pincodes and lanes. Courier serviceability CSV import. Packaging profiles. Blackout calendars.
- Vendor onboarding: FSSAI and GSTIN, payout account, commission.
- Catalogue moderation (labelling compliance).
- Exceptions queue: at-risk shipments, failed delivery attempts (NDR), vendor shortfalls, claims → refund or reship.
- Reports: on-time % per lane, spoilage claims, vendor SLA.

### 2.5 Out of scope for Phase 1
Same-city delivery, COD, multi-vendor hampers, subscriptions, frozen/cooked meals, corporate bulk gifting, international, native apps (Phase 2).

---

## 3. Architecture & stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo 2 | Remote caching and task graphs. The standard Next.js + Expo setup. |
| Web | Next.js 16 App Router, React 19, Tailwind v4 (theme generated from `design-tokens`), TanStack Query | Server-rendered catalogue for SEO and speed. A translation layer (next-intl) arrives with the first regional language. |
| API | Hono + `@hono/zod-openapi`, versioned REST `/v1`, mounted in Next.js for Phase 1 | Old mobile builds keep working (additive-only `/v1`). Webhooks and partners need REST. One OpenAPI contract serves every client. The app is a package, so it can be deployed standalone later. |
| Shared domain | Zod 4 schemas, state machines, serviceability and pricing engines as pure TypeScript | Runs in the browser, on the server and in React Native. |
| Data and backend services | Supabase Mumbai (`ap-south-1`): Postgres, Auth, Storage, Realtime. Drizzle ORM. | Data stays in India (DPDP). SQL-first: constraints, partial indexes, row locks. Clients use Supabase only for auth, live updates and uploads. All writes go through the API. RLS as defence in depth. |
| Auth | Supabase phone OTP via an MSG91 SMS hook (DLT-compliant). Google sign-in secondary. Roles in custom JWT claims. | Phone OTP is the norm in India. Tokens are verified locally against Supabase's public keys (JWKS). |
| Payments | Razorpay (UPI, cards, netbanking) + Razorpay Route for vendor splits | UPI-native. Route holds each vendor's settlement until delivery plus the claim window. React Native SDK available for Phase 2. |
| Logistics | Shiprocket aggregator behind a `CarrierProvider` interface, plus a fake adapter for tests | One API for rates, AWBs, pickups, labels and tracking webhooks. Direct courier contracts can be swapped in later. |
| Jobs | Vercel Cron + transactional outbox ([ADR 0004](adr/0004-scheduling-with-cron-and-outbox.md)) | Every side effect (book courier, notify, refund, payout) is written in the same transaction as the state change, then run with retries and backoff. Cron only supplies the clock. Inngest stays an option if workflows outgrow this. |
| Notifications | WhatsApp Business API, MSG91 SMS, Resend email | WhatsApp is the main order-update channel in India. |
| Hosting | Vercel (functions in `bom1` Mumbai) + Supabase Mumbai | App and database in the same region. |
| Quality | Vitest + fast-check, Playwright, GitHub Actions; Sentry and PostHog at M9 | Domain logic is tested exhaustively. End-to-end runs against Razorpay test mode and the fake courier. |

```
            apps/web (Next.js: storefront · /vendor · /ops)          apps/mobile (Expo), Phase 2
                 │ server components read via core (in-process)             │
                 │ client components ──── HTTPS /api/v1 (OpenAPI) ──────────┘  cookie (web) | Bearer (mobile)
                 ▼
   ┌─ packages/api ─────── Hono routes · auth · webhooks ◀── Razorpay · Shiprocket · WhatsApp
   ├─ packages/core ────── use-cases, transactions, outbox (server-only)
   └─ packages/domain ──── pure rules: serviceability, pricing, state machines (shared everywhere)
                 │                                   │
     Supabase Mumbai (Postgres · Auth · Storage · Realtime)    Vercel Cron → outbox → Razorpay · Shiprocket · MSG91 · WhatsApp · Resend
```

### 3.1 Architecture principles
1. **Business logic lives only in `domain` (pure) and `core` (I/O).** Route handlers, server components and screens stay thin.
2. **One `/v1` contract for every client.** API schemas are written by hand in `domain`, never generated from table shapes.
3. **Conservative promises.** p90 transit decides spoilage feasibility. p50 is display-only.
4. **Money is integer paise.** Times are `timestamptz`, and business rules are evaluated in IST (`Asia/Kolkata`).
5. **Postgres enforces invariants.** Check constraints make overselling impossible. Transitions use optimistic locking. The transactional outbox guarantees side effects happen exactly when the transaction commits.
6. **Import boundaries (lint-enforced).** `domain` imports nothing internal. `core` → `domain`. `api` → `core`. Apps → `api`/`core`. Mobile may import only `domain`, `api-client` and `design-tokens`.

---

## 4. Serviceability & delivery-date engine

A pure function in `packages/domain` that plans each shipment (one vendor's items arriving on one date). For candidate dispatch date **D**, lane **L** and packaging **P**:

```
prepared_at  = made_to_order ? D @ vendor prep time : D − item.max_age_at_dispatch
pickup_at    = D @ vendor.ready_for_pickup   (must be ≤ L.pickup_cutoff for same-day linehaul)
eta_p90      = pickup_at + L.transit_p90 (+ ODA extra), skipping the courier's non-delivery days

FRESHNESS  eta_p90 ≤ min_i(prepared_at + shelf_life − min_residual)                → deliver_by_at
COLD CHAIN P.temp_class ≥ strictest item temp_class  AND  eta_p90 − packed_at + handling buffer ≤ P.max_hold_hours
CUTOFF     now ≤ (D − vendor.prep_lead_days) @ vendor.order_cutoff
CAPACITY   inventory slot for (variant, D) has enough stock for every line; vendor shipments on D < daily cap
CALENDAR   D is one of the vendor's dispatch weekdays and is not blacked out (vendor, city, courier, national)
DRY ICE    P.coolant = DRY_ICE  ⇒  L.accepts_dry_ice
```

- **Goal "earliest":** min eta, then min cost.
- **Goal "deliver on X" (gifting):** reverse-schedule. The latest feasible D with `eta_p90 ≤ X` (freshest food), then min cost.
- **Infeasible:** returns reason codes (`SHELF_LIFE_EXCEEDED`, `NO_LANE`, `CUTOFF_PASSED`, `SOLD_OUT`, `VENDOR_CLOSED`, `PACKAGING_HOLD_EXCEEDED`, …).
- **`min_residual`** defaults to the FSSAI e-commerce floor (currently advised as 30% of total shelf life / 45 days; *confirm with counsel*). Vendors can only raise it.

**Fees:**
- **Chargeable weight:** `max(dead weight, L×B×H ÷ 5000)` for air. Insulated boxes usually bill on volume: 1 kg of sweets in a 30×25×20 cm insulated box bills as 3 kg.
- **Shipping fee:** rate card (zone, mode) + ODA surcharge.
- **Packaging fee:** profile cost.
- **Promotions:** subsidies and free-shipping thresholds are config rules.

**Edge cases:**
- Quotes expire after 15 min and are re-validated on capture.
- A hold created before the cutoff stays valid until it expires.
- One box per shipment in the MVP. Overflow splits the shipment.

---

## 5. Data model & order state machine

The authoritative schema lives in `packages/db/src/schema/*` (Drizzle) and its SQL migrations. The core tables are:

`cities` · `pincodes` · `vendors` · `categories` · `items` · `item_variants` · `inventory_slots` · `inventory_holds` · `packaging_profiles` · `serviceability_matrix` · `rate_cards` · `calendar_blackouts` · `orders` · `shipments` · `order_items` · `dispatch_batches` · `shipment_events` · `payments` · `refunds` · `vendor_payouts` · `claims` · `outbox` · `profiles` · `memberships` · `addresses`

**Key invariants (enforced in SQL):**
- `inventory_slots`: `reserved + sold <= capacity` makes overselling impossible.
- `items`: `min_residual_hours < shelf_life_hours`.
- `serviceability_matrix`: `transit_hours_p90 >= transit_hours_p50`. Unique on (origin city, dest pincode, carrier, mode).
- `orders`: grand total = items + packaging + shipping − discount.
- `shipments`: `status = FAILED ⇔ failure_reason IS NOT NULL`. Optimistic-lock `version`.

**Order (derived):** `PENDING_PAYMENT → CONFIRMED → IN_FULFILLMENT → COMPLETED | CANCELLED`. An unpaid hold that times out goes `PENDING_PAYMENT → EXPIRED`.

**Shipment (intercity flow):**

```
PLACED ─cutoff─▶ BATCHED ─▶ PACKED_COLD_CHAIN ─▶ PICKED_UP ─▶ IN_TRANSIT_INTERCITY ─▶ AT_DESTINATION_HUB ─▶ OUT_FOR_LOCAL_DELIVERY ─▶ DELIVERED
  │                │              │                                                                        │        ▲
  ▼                ▼              └─ courier no-show: refrigerate, re-plan pickup if deliver_by allows     ▼        │ retry only if
CANCELLED   FAILED(VENDOR_UNFULFILLED)                                                     DELIVERY_ATTEMPT_FAILED ─┘ before deliver_by
                                     any in-flight state ──deliver_by_at passed / lost / damaged──▶ FAILED(SPOILED|LOST|DAMAGED|UNDELIVERABLE)
```

| Transition | Trigger | Guard | Side effects |
|---|---|---|---|
| → PLACED | Razorpay `payment.captured` | Hold valid, or re-reserve succeeds | Holds → sold. Notify customer, recipient and vendor. |
| PLACED → CANCELLED | Customer / ops | Before vendor cutoff | Release stock. Full refund. |
| PLACED → BATCHED | Cutoff job | Cutoff reached | Attach to dispatch batch. Production sheet. Edits locked. |
| BATCHED → PACKED_COLD_CHAIN | Vendor | Packaging matches plan; before pickup cutoff | Record prepared/packed times. Recompute `deliver_by_at`. AWB and label. |
| BATCHED → FAILED | Vendor reports a shortfall | n/a | Auto refund. Vendor score updated. |
| PICKED_UP … OUT_FOR_LOCAL_DELIVERY | Courier webhooks | Forward-only, idempotent | Timeline. At-risk monitor (`ETA > deliver_by_at`). |
| → DELIVERED | Courier proof of delivery | n/a | Claim window opens. Payout release scheduled. |
| → FAILED | Ops / deadline job | `deliver_by_at` passed, lost or damaged | Refund or reship by fault. No RTO: dispose. |

**Enforcement:**
- The transition table lives in `packages/domain`.
- The server applies `UPDATE … WHERE status=$from AND version=$v`, with `shipment_events` and `outbox` written in the same transaction.
- Quality complaints are `claims` records. They don't change the shipment's state.

---

## 6. Confirmed decisions (Phase 1)

| # | Decision | Choice |
|---|---|---|
| 1 | Fulfilment model | Vendor-packed with platform-supplied kits. The schema also supports `HUB_PACKED`. |
| 2 | Launch footprint | Origins: Kolkata, Hyderabad, Delhi NCR, Bengaluru. Destinations: Delhi NCR, Mumbai, Bengaluru, Hyderabad, Chennai, Kolkata, Pune. No same-city delivery. |
| 3 | Categories | Tier A (ambient) + Tier B (chilled, air only). Cooked/frozen deferred to Phase 3. |
| 4 | Payments | Razorpay + Razorpay Route. |
| 5 | API & hosting | Hono + OpenAPI REST `/v1`, Vercel `bom1` + Supabase Mumbai. |

**Compliance to confirm with counsel / CA before launch:**
- FSSAI minimum residual shelf life at delivery.
- GST treatment: goods (vendor charges GST, platform collects TCS u/s 52) vs restaurant service (ECO pays u/s 9(5)).
- Legal Metrology declarations on product pages.
- Consumer Protection (E-Commerce) Rules: seller details and grievance officer.
- DPDP Act consent and notices.

---

## 7. Roadmap

**Business setup to start in week 1** (blocks launch, not code):
- marketplace FSSAI licence
- Razorpay KYC + Route activation
- TRAI DLT registration + SMS templates
- WhatsApp Business verification + message templates
- Shiprocket account + rate cards
- temperature-logger packaging trials on every launch lane

| # | Milestone | Exit test |
|---|---|---|
| M0 | Foundations: monorepo, TS, lint boundaries, CI, Drizzle, env, ADRs | CI green. `/api/v1/health` reads the DB. |
| M1 | Domain engines: schemas, state machines, serviceability, pricing | Property tests: never promise a date that breaks the minimum-shelf-life rule. A CLI prints the delivery calendar. |
| M2 | Data: schema, migrations, RLS, seeds (cities, pincodes, lanes, packaging), reservation SQL | 50 parallel reservations → zero oversell. |
| M3 | API v1 + auth: catalogue, availability, quote, orders, webhooks. Cookie + Bearer auth. `api-client`. | Contract tests. OpenAPI docs. |
| M4 | Customer discovery: selectors, SSR pages, freshness badges, pincode checker, calendar, SEO pages | Playwright discovery tests. Lighthouse mobile ≥ 90. |
| M5 | Cart, checkout, Razorpay, notifications, tracking, cancel/refund | E2E: place → pay → confirmed → cancel → refunded. |
| M6 | Vendor portal: caps calendar, batches, production sheet, packing, labels, manifest | One vendor runs a full dispatch day in staging. |
| M7 | Logistics automation: cutoff job → batch → Shiprocket; tracking webhooks; at-risk monitor | Simulated day with the fake carrier + one sandbox shipment. |
| M8 | Admin & ops: cities, lanes, blackouts, vendor onboarding, exceptions, claims, payouts | Launch a vendor and city with no deploy. |
| M9 | Hardening & pilot: 10× festival load test, security, DPDP, monitoring, runbooks | Pilot on 2–3 lanes. |

**Progress (October 2026):** M0–M8 are built and running against the fake payment and courier adapters, with 180+ unit, property and database tests. Playwright journeys run on phone and desktop:
- **Shopper:** pincode → dated pre-order → pay.
- **Kitchen and ops:** batch → pack → label → courier scans → delivered.
- **Onboarding:** ops adds a kitchen, drafts its first delicacy (checking where it can reach fresh), puts it on sale and takes the kitchen live; routes are edited from the console.

Launching a kitchen, a delicacy, a route or a city is now a data change made in the ops console:
- **Kitchens** start in onboarding and go live only when their checklist passes: a valid FSSAI licence, an owner who can sign in, something on sale, routes out of the city, and dispatch days. Owners are invited by mobile number and keep the invitation when they first sign in through Supabase.
- **Delicacies:** the form previews, with the real planner, which cities each one can reach fresh before it goes on sale.
- **Routes:** one courier service from a city to every pincode of another.
- **Cities:** each new city claims its districts from the pincode directory.

Still open in M8: a payouts screen for ops (kitchens already see their own).

Next up is M9, along with the business setup above. Razorpay and Shiprocket are switched on with environment variables (see `.env.example`).

- **Phase 2:** Expo app reusing `domain`, `api-client` and `design-tokens`. Razorpay RN SDK, push notifications, deep links. Optional standalone `apps/api-server`.
- **Phase 3:** Frozen/cooked meals, learned transit times, hampers and corporate gifting, origin hubs, direct courier contracts, Tier-2 rollout.

---

## 8. Repository layout

```
food-del/
├── apps/
│   ├── web/                      # Next.js 16: storefront, /vendor, /ops; mounts packages/api at /api/v1
│   ├── mobile/                   # Phase 2: Expo + Expo Router
│   └── api-server/               # Phase 2 (optional): standalone Node entry for packages/api
├── packages/
│   ├── domain/                   # PURE TS: schemas, serviceability, pricing, order-state, calendar
│   ├── db/                       # Drizzle schema, migrations, RLS, seeds
│   ├── core/                     # server-only use-cases, transactions, outbox, scheduled jobs
│   ├── api/                      # Hono + zod-openapi /v1, auth middleware, webhooks
│   ├── api-client/               # typed client + TanStack Query hooks (web + mobile)
│   ├── integrations/             # payments/razorpay, logistics/shiprocket (+fake), sms, whatsapp, email
│   ├── design-tokens/            # TS tokens → Tailwind v4 @theme (web) + NativeWind preset (mobile)
│   └── config/                   # shared tsconfig / vitest presets
├── design-system/               # design rules for every screen (MASTER.md)
├── docs/                         # this blueprint, ADRs, runbooks
└── turbo.json · pnpm-workspace.yaml · package.json · .nvmrc
```
