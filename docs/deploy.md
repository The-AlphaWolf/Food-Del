# Deploying to Vercel

The first deploy is a **demo**: real hosting and database, but fake payments and courier, and development sign-in (code `123456`). Switching to live providers later is only a change of environment variables (see "Going live" in the README).

## 1. Database (Supabase, Mumbai)
1. Create a Supabase project in **ap-south-1 (Mumbai)**.
2. Project → Connect. Copy two connection strings:
   - **Transaction pooler** (port **6543**): the app uses this.
   - **Session pooler** or direct connection (port **5432**): migrations use this.
3. GitHub → repository Settings → Environments → **production** → add secret `DATABASE_URL` = the port **5432** string.
4. Actions → **Database** → Run workflow:
   - environment: production;
   - seed: on.

   This creates the tables (row-level security on) and loads the demo catalogue: cities, lanes, kitchens, delicacies and dev accounts. Re-running is safe; migrations apply once and the seed skips a database that already has data.

## 2. Vercel project
1. Vercel → Add New → Project → import `The-AlphaWolf/Food-Del`.
2. **Root Directory:** `apps/web`. Vercel detects Next.js and pnpm and builds the workspace packages. The region (`bom1`, Mumbai) and cron schedule come from `apps/web/vercel.json`.
3. Environment variables (Production):

| Name | Value |
|---|---|
| `DATABASE_URL` | the **6543** transaction-pooler string |
| `APP_URL` | `https://<project>.vercel.app` (or your domain) |
| `ALLOW_DEMO_MODE` | `1`. Lets a production build run with fake providers. Remove when going live. |
| `AUTH_MODE` / `NEXT_PUBLIC_AUTH_MODE` | `dev` |
| `AUTH_DEV_SECRET` | 48+ random characters (`openssl rand -base64 48`) |
| `DEV_TOOLS` / `NEXT_PUBLIC_DEV_TOOLS` | `1`, for the test-payment button and courier simulator |
| `CRON_SECRET` | random string; Vercel Cron sends it to the job endpoints |
| `OPS_EMAIL` | where at-risk alerts go (optional) |
| `SENTRY_DSN` | optional |

4. Deploy.

## 3. Check it
- `https://<app>/api/v1/health/ready` → `{"ready":true}`.
- Sign in at `/ops` with the dev ops number **9900000002**, code **123456**.
- Overview → System health: within a few minutes the jobs show *On schedule*.
- Place an order on the storefront and pay with the test-payment button.

## Things to know
- **Cron needs Vercel Pro.** The jobs run every 1–15 minutes (`vercel.json`). Vercel's Hobby plan only allows daily cron jobs and rejects the deployment.
  - **On Pro:** nothing to do.
  - **On Hobby:** remove the `crons` block and trigger jobs another way. The ops console's **Run now** works for a demo.
- **Lock the demo down.** Anyone can sign in as any seeded account, including ops, with code `123456`. Turn on Vercel → Settings → Deployment Protection for production too (Vercel Authentication or a password) until real sign-in is configured.
- **Migrations before code.** Later schema changes: run the Database workflow first, then let the deploy go out. See [deploy and roll back](runbooks/deploy-and-rollback.md).
