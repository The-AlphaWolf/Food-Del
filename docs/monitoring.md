# Monitoring

How we know Food-Del is working, and who finds out when it isn't.

## What is watched
| Signal | Where | Healthy means |
|---|---|---|
| **Scheduled jobs.** Every run is recorded in `job_runs`: start, duration, items processed, error. | Ops console → **System health**; `GET /v1/ops/health` | Each job ran within `max(3 × cadence, cadence + 10 min)` and its last run succeeded |
| **Queued work.** Outbox messages are due, waiting, or parked after 8 failed attempts. | Same panel | Nothing due for more than 15 min; nothing parked |
| **Signs of life.** Last payment captured and last courier tracking update. | Same panel | Recent during trading hours. A long gap during a sale points to a broken webhook. |
| **Readiness** | `GET /api/v1/health/ready` (public, `no-store`) | 200 `{ready:true}`. 503 if the database doesn't answer, the outbox job is late or failing, or due work is older than 15 min. |
| **Liveness** | `GET /api/v1/health` | 200 when the database answers |

Job cadences live in `JOB_CADENCE_MINUTES` (`packages/domain/src/contracts/ops.ts`). A unit test fails if `apps/web/vercel.json` schedules a job at a different cadence or leaves one out.

## Alerting
- **Uptime monitor.** Point it (Better Stack, UptimeRobot or Vercel checks) at `/api/v1/health/ready` every minute. Page on two consecutive failures.
- **Sentry.** Set `SENTRY_DSN`. Every `logger.error` is also sent to Sentry as an event grouped by message. Errors come from:
  - failed jobs;
  - outbox messages parked after their last retry;
  - unhandled API errors.

  Keys that look like personal data (phone, email, address, tokens, codes) are redacted before sending. Reporting is server-side only, so the browser CSP is unchanged.
- **Ops alerts.** At-risk parcels and new claims already go to `OPS_PHONE` / `OPS_EMAIL` through the notification outbox.

## Retention
- `job_runs`: 14 days.
- Expired rate-limit windows: 1 day.

The daily `housekeeping` job prunes both.

## Known limits
- On serverless, a Sentry send started just before a function returns can be dropped. The structured log line is always written, so search Vercel logs when Sentry is quiet but readiness is failing.
- Job health shows that a job *ran*, not that it did the right thing. Business checks (at-risk parcels, payouts stuck) live on the overview and payouts screens.
