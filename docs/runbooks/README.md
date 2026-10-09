# Runbooks

What to do when something goes wrong, written for whoever is on call: not necessarily the person who built it. Every runbook starts from a symptom you can see and ends with how you know it's fixed.

| Symptom | Runbook |
|---|---|
| Something is broken and you're not sure what | [Incident response](incident-response.md) |
| Customers paid but orders show unpaid, refunds stuck, payment errors | [Payments](payments.md) |
| Bookings fail, no courier updates, labels missing | [Courier outage](courier-outage.md) |
| Parcels flagged *at risk* on the ops overview | [At-risk parcels](at-risk-parcels.md) |
| Kitchen says it wasn't paid, payout screen shows stuck money | [Payout reconciliation](payout-reconciliation.md) |
| Shipping a change, a migration, or undoing one | [Deploy, migrate, roll back](deploy-and-rollback.md) |
| Diwali, Rakhi or another peak is three weeks away | [Festival readiness](festival-readiness.md) |

## Where to look first
- **Ops console → Overview → System health.** Each scheduled job's last run and errors, queued and parked work, last payment and last courier update. See [monitoring](../monitoring.md).
- **`/api/v1/health/ready`**: the uptime monitor's view; 503 means queued work is stalling.
- **Sentry**: errors grouped by message (failed jobs, parked queue work, unhandled API errors).
- **Vercel → Logs**: structured JSON lines; search by `requestId` (every error reply carries one as "Reference …").
- **Supabase → Database**: read-only queries only, unless a runbook says otherwise.

## Severity
| | Means | Response |
|---|---|---|
| **SEV1** | Customers can't order or pay, money is moving wrongly, or personal data may have leaked | Drop everything. Post in the incident channel within 5 min; update every 30 min. |
| **SEV2** | A city, lane, kitchen or courier is down; parcels are at risk of spoiling | Respond within 15 min in trading hours. |
| **SEV3** | Degraded but working (slow pages, one failed job that retries) | Next working day. |

Perishable food raises the stakes: a 4-hour courier outage can spoil a whole day's chilled parcels. When in doubt, treat parcel-in-transit problems as SEV2.
