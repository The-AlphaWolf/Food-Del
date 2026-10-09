# Security controls

What protects Food-Del today, where it lives, and what is still open. Review this before every launch milestone.

## Identity and access
| Control | Where |
|---|---|
| Phone OTP sign-in via Supabase Auth (MSG91, DLT); sessions verified against Supabase JWKS | `packages/api/src/auth.ts` |
| Dev logins (`AUTH_MODE=dev`, code 123456) refused in production unless `ALLOW_DEMO_MODE=1` | `apps/web/src/server/env.ts` |
| Access by route family, checked **before** input validation: `/v1/ops/*` staff only, `/v1/vendor/*` kitchen staff or ops, `/v1/me`, `/v1/orders`, `/v1/shipments` signed in | `packages/api/src/security.ts` |
| Per-record checks inside every use-case (your orders, your kitchen) | `packages/core/src/viewer.ts` |
| Authorization matrix test: every documented route is called anonymously and as a customer with an invalid body; protected ones must refuse with 401/403 | `packages/api/test/security.test.ts` |
| Row-level security on every table (test fails if a table is added without it) | `packages/db/migrations/0001_rls_and_auth.sql`, `packages/db/test/schema.test.ts` |

## Requests
| Control | Where |
|---|---|
| Cookie sessions are `HttpOnly`, `Secure`, `SameSite=Lax`. Writes that rely on the cookie must come from our own origin (`Origin`/`Sec-Fetch-Site`), otherwise 403 `CROSS_SITE_REQUEST`. | `security.ts` |
| Rate limits, Postgres-backed so they hold across serverless instances: orders 20/h per user, payments 30/h, claims 10/day, quotes and calendars 120/min per IP, pincode checks 60/min, data exports 5/day, dev/demo OTP 100 per 15 min per IP. Over the limit: 429 with `Retry-After`. | `security.ts` (`RATE_LIMIT_POLICIES`) |
| Idempotency keys on order placement; client-supplied totals checked (`PRICE_CHANGED`) | `packages/core/src/services/orders.ts` |
| Webhooks: Razorpay HMAC and Shiprocket token compared in constant time; events are idempotent | `packages/integrations` |
| Scheduled jobs and the dev tick need the cron secret (constant-time compare) or an ops session | `routes/webhooks.ts`, `routes/dev.ts` |

## Browser
| Control | Where |
|---|---|
| Content-Security-Policy: scripts only from us and Razorpay Checkout; connections only to us, Razorpay and Supabase; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`/`form-action 'self'` | `apps/web/next.config.ts` |
| HSTS (2 years), `X-Frame-Options: DENY`, `nosniff`, strict referrer, camera/mic/geolocation off | `next.config.ts` |
| Browser tests fail on any CSP violation in the checkout journey | `apps/web/e2e/storefront.spec.ts` |

## Money
- Payouts move only through provider transfers; clawbacks reverse them ([ADR 0005](adr/0005-payouts-move-only-through-transfers.md)).
- Refunds and transfers go through the transactional outbox, so a crash never loses or duplicates one.

## Open items
- **Nonce-based CSP:** `script-src` still allows `'unsafe-inline'` for Next's hydration data. Moving to per-request nonces requires dynamic rendering of every page.
- **Supabase Auth limits:** set OTP send/verify limits and CAPTCHA (hCaptcha/Turnstile) in the Supabase project before launch.
- **Edge protection:** enable Vercel's firewall/bot protection rules for `/api/v1/orders` and `/api/v1/quotes` ahead of festival peaks.
- **Secrets:** rotate `AUTH_DEV_SECRET`, `CRON_SECRET` and provider keys per environment; never reuse staging keys in production.
- **Dependency audit:** add `pnpm audit --prod` to CI once the pinned dependency set settles.
