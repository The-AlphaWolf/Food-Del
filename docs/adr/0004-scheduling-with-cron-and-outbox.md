# ADR 0004: Vercel Cron + transactional outbox instead of Inngest (Phase 1)

- **Status:** Accepted (supersedes the "Jobs: Inngest" line of the blueprint for Phase 1)
- **Date:** 2026-10-09

## Context
The blueprint proposed Inngest for durable workflows: cutoff → batch → book courier → notify. While building, every side effect ended up recorded in a **transactional outbox**, written in the same database transaction as the state change. A worker then executes it inside a savepoint, with retries, exponential backoff and a FAILED state that ops can see. That already gives us durability, idempotency and visibility. The only remaining need is a clock to trigger the jobs.

## Decision
- Scheduled jobs are plain functions in `packages/core` (`runJob`), exposed at `GET/POST /api/v1/jobs/{job}` and protected by `CRON_SECRET` or an ops session.
- **Production:** Vercel Cron (`apps/web/vercel.json`) calls them:

  | Job | Schedule |
  |---|---|
  | `process-outbox` | every minute |
  | `expire-holds` | every 5 min |
  | `lock-batches` | every 5 min |
  | `monitor-at-risk` | every 15 min |
  | `release-payouts` | hourly |
  | `materialize-slots` | nightly |

- **Development:** `pnpm --filter @food-del/web jobs:tick` calls `/api/v1/dev/tick` every 30 s. Ops can also run any job from the console.

## Consequences
- There is one less vendor and secret to manage. Jobs are testable as ordinary functions (see `packages/core/test`).
- Cutoff locking runs up to 5 minutes after a cutoff. The customer-facing cutoff is enforced at order time regardless, so that delay is harmless.
- If we later need long-running, multi-step workflows with fan-out (e.g. corporate bulk gifting), Inngest or Trigger.dev can call the same core functions.
