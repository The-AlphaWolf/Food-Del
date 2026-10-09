# Incident response

## 1. Declare
- Name an incident lead (whoever noticed, until handed over) and post in the incident channel. Include: what's broken, since when, severity, who's leading.
- One person talks to customers, kitchens and couriers; the lead fixes or coordinates.

## 2. Stabilise before diagnosing
| If… | Then |
|---|---|
| A deploy went out in the last hour | Roll back first ([deploy-and-rollback](deploy-and-rollback.md)), investigate after. |
| Payments are failing for everyone | Check [payments](payments.md). If the provider is down, pause sales: add a NATIONAL blackout for today and tomorrow on **Ops → Calendar** so no new orders promise those dates. |
| A courier is down | [Courier outage](courier-outage.md). |
| One kitchen can't fulfil | **Ops → Kitchens → (kitchen) → Pause** stops new orders. Then handle its open parcels as in [at-risk parcels](at-risk-parcels.md). |
| Queued work is piling up (System health: *Queued work due* rising, oldest waiting > 15 min) | Press **Run now** on *Send queued work*. If it fails, the error is shown on the job row; the usual causes are a provider key or an outage. |

## 3. Diagnose
- **System health** shows which job is failing, with its last error.
- **Sentry** shows what's throwing, and how often since when.
- **Vercel logs**: filter by path or `requestId`.

Recent changes are the usual cause. Check `git log` on `main` and the Vercel deployment list.

## 4. Close
- Confirm the symptom is gone:
  - readiness is 200;
  - the job is *On schedule*;
  - there is no new Sentry event for 30 min.
- Tell everyone you told about the incident.
- Write a short review within 3 working days: timeline, impact (orders, parcels, rupees), cause, what stops it happening again. File the follow-ups.

## Personal data breach (DPDP Act, CERT-In)
If personal data may have been exposed (database dump, leaked key, wrong customer shown another's order), it is a **SEV1**:
1. **Contain.** Rotate the exposed secret, revoke the access and close the hole.
   - Database password: Supabase → Settings → Database.
   - Service-role key: Supabase → API.
   - App secrets: Vercel → Environment Variables, then redeploy.
2. **Preserve evidence.** Export the relevant logs before they roll off.
3. **Report to CERT-In within 6 hours** of noticing (incident@cert-in.org.in, CERT-In 2022 directions).
4. **Tell the Data Protection Board and every affected person without delay.** Under the DPDP rules, the Board needs the detailed report within 72 hours. The Grievance Officer owns these notices; see [privacy](../privacy.md).
5. Customers' contact details are only in `profiles`, `addresses`, `orders.ship_to`, `notifications` and Supabase Auth. Scope the breach against those.
