# GitHub Pages demo

**Live:** https://the-alphawolf.github.io/Food-Del/

GitHub Pages only serves static files, but Food-Del needs an API and Postgres. The demo runs both **in the visitor's browser**, so the site is fully usable: browse, order, pay (test), track; the kitchen portal; and the ops console.

## How it works
- **Backend in a service worker** (`packages/demo`). `demo-sw.js` answers every `/Food-Del/api/*` request. It uses the same Hono API and core services as production, fake payments and courier, and **PGlite**: real Postgres compiled to WebAssembly, stored in the browser's IndexedDB.
  - On first visit it downloads Postgres (about 17 MB, cached by the browser), runs the same SQL migrations and loads the seed catalogue. That takes a few seconds behind a loading screen; later visits start almost at once.
  - Scheduled jobs (batch locking, queued work, payouts…) run at most once a minute, triggered by API traffic.
- **Static site** (`pnpm --filter @food-del/web build:pages`): a Next.js static export under `/Food-Del`.
  - Pages that normally render on the server with database access (home, city, kitchen, delicacy, send-to, search) render the same views in the browser, loading through the API.
  - Orders, kitchens and delicacies created in the demo have no pre-built page. GitHub Pages serves `404.html`, which renders the right screen from the URL (`components/demo/fallback.tsx`).
- **Deploy:** `.github/workflows/pages.yml` runs on every push to `main`. It builds the export, runs the Playwright journey against it (`e2e-pages/`), and publishes `apps/web/out` to the `gh-pages` branch.

## Using it
- Sign in with any 10-digit mobile number; the code is always `123456`.
  - Ops console: `9900000002`.
  - A kitchen (Chandni Chowk Halwai & Sons, Delhi): `9900000105`.
- Everything is per browser: other visitors don't see your orders. **Reset demo** in the banner erases this browser's data and starts again from the seed.
- Needs a browser with service workers and IndexedDB. Some private-browsing modes block them; the loading screen says so.

## Run it locally
```sh
pnpm --filter @food-del/web build:pages
node apps/web/scripts/serve-pages.mjs        # http://localhost:4173/Food-Del/
pnpm --filter @food-del/web e2e:pages
```

## Limits
- No server-side rendering: search engines see loading placeholders, not the catalogue. The Vercel deployment ([deploy](deploy.md)) is the real product.
- The browser's clock drives cutoffs and dispatch days.
- One person's data in one browser; nothing is shared or backed up.
