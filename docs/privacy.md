# Privacy and the DPDP Act

How Food-Del meets India's Digital Personal Data Protection Act, 2023 for customers. The customer-facing text is `/privacy` (`apps/web/src/app/privacy/page.tsx`).

| Duty | How | Where |
|---|---|---|
| **Notice** (s.5) | Itemised notice: what we collect, why, how long, who else sees it, rights, Grievance Officer. Linked from sign-in and the footer. | `/privacy` |
| **Record of notice** | Signing in records the notice version shown (`privacy_events`, `NOTICE_ACKNOWLEDGED`). Bump `PRIVACY_NOTICE_VERSION` when the notice changes; the account page then asks people to read it again. | `packages/domain/src/privacy.ts`, `POST /v1/me/privacy-notice` |
| **Access** (s.11) | "Download my data": profile, addresses, orders, parcels, payments, claims, messages and privacy history as JSON. Limited to 5 a day. | `GET /v1/me/export` |
| **Correction** (s.12) | Name, email and addresses are editable in the account. | `/account` |
| **Erasure and withdrawal** (s.12, s.6(4)) | "Delete my account" erases at once: name, phone, email, saved addresses, delivery names/phones/streets on orders, gift messages, claim text and photos, and message contents. Order amounts, items, pincode and state stay for GST records (`RETENTION.taxRecordYears`). Refused while an order or claim is in progress, and for kitchen/staff accounts, which ops close. The Supabase login is removed when `SUPABASE_SERVICE_ROLE_KEY` is set. | `DELETE /v1/me`, `PrivacyService.deleteAccount` |
| **Storage limitation** (s.8(7)) | Daily housekeeping drops message text after 180 days and masks the recipient. | `PrivacyService.applyRetention` |
| **Grievance redressal** (s.13) | Grievance Officer name and email come from `GRIEVANCE_OFFICER_NAME` / `GRIEVANCE_EMAIL`. The page never shows a made-up name. | `.env.example` |
| **Security safeguards** (s.8(5)) | See [security.md](security.md). Error reports to Sentry have contact details redacted. | |
| **Children** (s.9) | Accounts are for adults (stated in the notice). | |

## Before launch
- Appoint a Grievance Officer and set `GRIEVANCE_OFFICER_NAME` and `GRIEVANCE_EMAIL`.
- Have counsel review `/privacy` and the processor list. Sign data-processing terms with each processor (Supabase, Vercel, Razorpay, Shiprocket, MSG91, Meta, Resend, Sentry).
- Set `SUPABASE_SERVICE_ROLE_KEY` (server only) so erasure also removes the login.
- Breach response: notify the Data Protection Board and affected people. See the incident runbook.
- Claim photos in storage: when photo upload moves to Supabase Storage, erasure must also delete those files.
