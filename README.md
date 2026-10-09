# Food-Del

Cross-city delicacy delivery for India: iconic regional sweets, bakes and specialities, shipped fresh from their home city with scheduled pre-orders, batch dispatch and a passive cold chain.

- **Product and technical blueprint:** [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md)
- **Architecture decisions:** [`docs/adr/`](docs/adr)

## Repository layout

| Path | What lives there |
|---|---|
| `packages/domain` | Pure TypeScript rules shared by server, web and mobile: serviceability and delivery-date engine, pricing, shipment/order state machines, API contracts |
| `packages/db` | Drizzle schema, SQL migrations, seeds |
| `packages/core` | Server-side use-cases (quote, order, batch, carrier events) |
| `packages/api` | Hono + OpenAPI `/api/v1` |
| `packages/api-client` | Typed client + TanStack Query hooks for web and mobile |
| `packages/integrations` | Razorpay, Shiprocket, MSG91, WhatsApp, email adapters (+ fakes) |
| `apps/web` | Next.js storefront, vendor portal and ops console |
| `apps/mobile` | Phase 2: Expo app |

## Getting started

```bash
corepack enable            # pnpm 10 via packageManager
pnpm install
pnpm test                  # all packages
pnpm calendar -- --item sandesh --days 14   # delivery calendar for a sample delicacy
```

Requires Node 22 LTS (`.nvmrc`).
