# Food-Del

Cross-city delicacy delivery for India: iconic regional sweets, bakes and specialities, shipped fresh from their home city with scheduled pre-orders, batch dispatch and a passive cold chain.

- **Live demo (runs entirely in your browser):** https://the-alphawolf.github.io/Food-Del/ ([how](docs/pages-demo.md))
- **Product and technical blueprint:** [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md)
- **Architecture decisions:** [`docs/adr/`](docs/adr)
- **Operations:** [`docs/runbooks/`](docs/runbooks/README.md), [pilot plan](docs/pilot-plan.md), [monitoring](docs/monitoring.md), [load test](docs/load-test.md)
- **Security and privacy:** [`docs/security.md`](docs/security.md), [`docs/privacy.md`](docs/privacy.md)

## Repository layout

| Path | What lives there |
|---|---|
| `packages/domain` | Pure TypeScript rules shared by server, web and mobile: serviceability and delivery-date engine, pricing, shipment/order state machines, API contracts |
| `packages/db` | Drizzle schema, SQL migrations (with RLS), seeds, inventory reservations |
| `packages/core` | Server-side use-cases (quote, order, batch, pack, carrier events, claims), the outbox and scheduled jobs |
| `packages/api` | Hono + OpenAPI `/api/v1`, auth, webhooks |
| `packages/api-client` | Typed client + TanStack Query hooks for web and mobile |
| `packages/integrations` | Razorpay, Shiprocket, MSG91, WhatsApp, email adapters (+ fakes) |
| `packages/design-tokens` | Colours, type, spacing → Tailwind v4 theme (web) and, later, NativeWind (mobile) |
| `apps/web` | Next.js storefront, kitchen portal (`/vendor`) and ops console (`/ops`) |
| `apps/mobile` | Phase 2: Expo app |
| `design-system/` | Design rules every screen follows |

## Getting started

Requires Node 22 LTS (`.nvmrc`) and PostgreSQL 16 (local, Docker or Supabase).

```bash
corepack enable                 # pnpm 10 via packageManager
pnpm install
cp .env.example .env            # point DATABASE_URL at your database
pnpm db:reset                   # migrate + seed cities, lanes, kitchens, delicacies, dev accounts
pnpm dev                        # http://localhost:3000
```

Out of the box everything runs locally with no third-party accounts:
- **Payments:** a fake gateway. "Pay (test)" completes the order.
- **Courier:** a fake carrier. AWBs and labels are generated, and ops can simulate scans.
- **Sign-in:** dev phone OTP. The code is shown on screen.

| Who | Phone | Where |
|---|---|---|
| Shopper | any Indian mobile number, e.g. `9900000001` | storefront |
| Ops desk | `9900000002` | `/ops` |
| Kitchen owners | `99000001NN`, one per seeded kitchen in order: `01` Bagbazar Mishti Ghar (Kolkata), `05` Chandni Chowk Halwai (Delhi NCR), … | `/vendor` |

**Onboarding.** Sign in at `/ops` as the ops desk:
- **Kitchens:** add one (it starts in onboarding), draft its delicacies with a live "where can it reach fresh" preview, then go live from its checklist.
- **Routes:** courier services between cities.
- **Cities:** claim a new city's pincodes from the directory.

**Payouts.** `/ops/payouts` shows:
- what each kitchen is owed and what's stuck, and why;
- what was paid or clawed back;
- a CSV statement for reconciling with Razorpay.

Kitchens are paid only through Razorpay Route transfers (see [ADR 0005](docs/adr/0005-payouts-move-only-through-transfers.md)).

**Scheduled jobs.** In production, Vercel Cron runs them (see [ADR 0004](docs/adr/0004-scheduling-with-cron-and-outbox.md)): batch locking at cutoff, courier booking, notifications, at-risk alerts and payouts. Locally, run them in a second terminal with `pnpm --filter @food-del/web jobs:tick`.

**API.** OpenAPI 3.1 at `/api/v1/openapi.json`, Swagger UI at `/api/v1/docs`.

## Checks

```bash
pnpm lint && pnpm typecheck
pnpm test                       # every package; needs TEST_DATABASE_URL (one database per package is created)
pnpm --filter @food-del/web build && pnpm e2e   # Playwright journeys on phone and desktop viewports
pnpm calendar -- --item sandesh --days 14        # delivery calendar for a sample delicacy
```

Playwright uses its own Chromium; to use one already installed, set `PW_CHROMIUM_PATH`.

## Going live

First deploy (demo on Vercel + Supabase): [`docs/deploy.md`](docs/deploy.md).

Set real providers in the environment (all listed in `.env.example`):
- `AUTH_MODE=supabase` plus the Supabase keys
- `PAYMENTS_PROVIDER=razorpay` plus the keys and webhook secret
- `CARRIER_PROVIDER=shiprocket` plus the credentials and webhook token
- the messaging keys
- `CRON_SECRET`

A production build refuses to start while any fake provider or dev login is still switched on, unless `ALLOW_DEMO_MODE=1`.
