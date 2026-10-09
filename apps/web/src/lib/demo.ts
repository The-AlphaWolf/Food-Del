/**
 * The static GitHub Pages build: no server, the API runs in a service worker in the browser
 * (packages/demo). Set at build time by `pnpm --filter @food-del/web build:pages`.
 */
export const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";
/** Where the site is mounted, e.g. "/Food-Del" on GitHub Pages; "" at a domain root. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
