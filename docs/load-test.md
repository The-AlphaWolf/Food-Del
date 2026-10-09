# Festival load test

M9 asks for a load test at 10× festival traffic. This page records the method, the results, what we fixed and what remains. Re-run it before every festival season and after any change to planning or the catalogue.

## Traffic model
The blueprint has no traffic forecast, so this is the working assumption for the 2–3 lane pilot:

| | Ordinary peak hour | Festival peak (10×) |
|---|---|---|
| Shopper API requests | 5 /s | **50 /s** |
| Orders placed and paid | 1 /min | **10 /min** (600 an hour) |

Browsing mix:
- 30% catalogue pages with a delivery pincode;
- 25% delicacy pages;
- 15% delivery calendars;
- 15% cart quotes;
- 10% pincode checks;
- 5% reference lists.

Orders run on their own schedule. Each one is placed and then paid through the dev payment capture, so payment webhooks, holds and the outbox are exercised too.

If pilot data shows a different peak, change `--rps` and `--orders-per-min`; the method stays the same.

## How to run
```sh
pnpm build && pnpm --filter @food-del/web start          # or point --base at a preview deploy
node apps/web/scripts/load-test.mjs --base http://localhost:3000 \
  --rps 50 --orders-per-min 10 --duration 120 --out results.json
```

The generator is open-loop: requests start on schedule however slow the server is. That means overload shows up as latency and errors instead of quietly reducing the load. Each simulated shopper sends its own client IP header, as real traffic arrives from many addresses.

The script fails (exit 1) if:
- any scenario's p95 goes over its budget (catalogue and delicacy pages 400 ms, calendars and quotes 600 ms, orders and payment 1.5 s); or
- more than 0.5% of requests fail (timeouts, 5xx, 429).

A "sold out", "past cutoff" or "doesn't deliver here" reply is a correct answer, not a failure.

For planning cost in isolation, `pnpm --filter @food-del/api bench` reports CPU milliseconds per request for each endpoint, in-process.

## Results (9 Oct 2026)
Setup:
- one `next start` process on a 4-core container;
- local Postgres;
- seeded catalogue: 43 delicacies, 50 variants, 7 destination pincodes;
- the load generator on the same machine.

These numbers are for one server process. Production spreads load across many function instances, and the CDN serves most reads (below).

| Run | Rate | Errors | p95 catalogue | p95 delicacy | p95 calendar | p95 quote | p95 order | p95 pay |
|---|---|---|---|---|---|---|---|---|
| 10×, before fixes | 50 /s | 0% | 55 ms | 27 ms | 27 ms | 30 ms | 111 ms | 146 ms |
| 20×, before fixes | 100 /s | **collapsed**: p95 over 5 s, timeouts | 5.3 s | 5.3 s | 4.4 s | 5.3 s | 8.9 s | 15 s |
| 10×, after fixes | 50 /s | 0% | 19 ms | 11 ms | 11 ms | 12 ms | 95 ms | 93 ms |
| 20×, after fixes | 100 /s | 0% | 22 ms | 14 ms | 14 ms | 15 ms | 40 ms | 137 ms |
| 30×, after fixes | 150 /s | 0% | 38 ms | 32 ms | 31 ms | 36 ms | 106 ms | 146 ms |

10× passed even before the fixes. The fixes raised a single process's ceiling from about 80 to over 150 requests a second, and the CDN change removes most read traffic from the servers entirely.

## What we found and fixed
1. **No public read was cacheable.** Catalogue, delicacy, kitchen, calendar and pincode responses had no `Cache-Control`, so every shopper's request at peak would reach a function and the database.
   - They now send `public, max-age=0, s-maxage=…`: catalogue, delicacy and kitchen pages 60 s, calendars 30 s, pincode checks 1 h.
   - Browsers always revalidate; Vercel's CDN serves repeats.
   - Stock and dates are re-checked when an order is placed, so a stale card can at worst lead to a "just sold out" reply.
2. **The server ran out of CPU, not database.** At 80 requests a second the app process sat at 100% of one core while Postgres used about 10%. Catalogue pages with a pincode cost 26 ms of CPU each, against 1–6 ms for everything else, because each card plans its own earliest delivery.
   - **Earliest-plan search stops early.** The planner evaluated all 22 dispatch days × lanes for every card. A parcel can't arrive before it leaves, so once dispatch days pass the earliest arrival found, the search stops. A property test checks over 600 random scenarios that it still picks exactly the plan a full scan would.
   - **Kitchen data is batched.** Each card loaded its kitchen, booked parcels and calendar blackouts separately, and the blackouts query returned the same rows for every kitchen. A page now loads all its kitchens in two queries and the blackouts once.
   - **Date conversions are memoised.** Planning turns the same few weeks of dates into instants and back thousands of times per page.

   Result: catalogue page CPU went from 26 ms to 12 ms per request.
3. **Abandoned requests were logged as server errors.** When a client gave up mid-upload, the half-read body surfaced as an unhandled 500 and paged through Sentry. Malformed or truncated JSON is now a `400 MALFORMED_REQUEST`.

## Production capacity notes
- **Database connections.** Each server instance opens up to 5 connections (`apps/web/src/server/core.ts`). Use Supabase's transaction pooler (port 6543) and check its client limit against the expected instance count at peak. 100 instances means 500 pooled clients.
- **Rate limits** hold per user or IP. They can't distinguish shoppers behind one carrier-grade NAT, so watch 429 rates on the System health panel during the first festival. The orders limit is 20 an hour per user.
- **Client IP.** `x-real-ip` / `x-forwarded-for` are trusted because Vercel sets them. Behind any other proxy, make sure the proxy overwrites them, or rate limits can be dodged.
- **Not covered here:**
  - Razorpay and Shiprocket latency (faked in this test);
  - rendering cost of the Next.js pages themselves, which are served statically or from the CDN;
  - cold starts.

  Re-run against a Vercel preview with real providers in test mode before the pilot.
