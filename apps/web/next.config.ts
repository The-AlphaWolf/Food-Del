import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// One .env at the repo root configures the app and the database scripts. Values already set
// (the deployment's environment, apps/web/.env.local) are never overwritten.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/**
 * Scripts only from us and Razorpay Checkout; API calls only to us, Razorpay and Supabase; no
 * framing by other sites. Inline scripts stay allowed for Next's hydration data until we move to
 * per-request nonces.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.razorpay.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.razorpay.com https://lumberjack.razorpay.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

/**
 * The GitHub Pages demo (`build:pages`): a static export with the API served by a service worker.
 * Only `.tsx` files become routes, which leaves out the API route handler, sitemap, robots and
 * manifest; a static host can't send response headers either.
 */
const staticDemo = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const config: NextConfig = {
  ...(staticDemo
    ? {
        output: "export" as const,
        basePath,
        trailingSlash: true,
        images: { unoptimized: true },
        pageExtensions: ["tsx"],
      }
    : {}),
  // Internal packages are shipped as TypeScript source.
  transpilePackages: [
    "@food-del/api",
    "@food-del/api-client",
    "@food-del/core",
    "@food-del/db",
    "@food-del/design-tokens",
    "@food-del/domain",
    "@food-del/integrations",
  ],
  poweredByHeader: false,
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: false },
  async headers() {
    if (staticDemo) return [];
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
          // Browsers ignore HSTS over plain http, so this is safe locally.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      {
        // The Swagger UI loads its own assets; everything else is ours, Razorpay's or Supabase's.
        source: "/((?!api/v1/docs).*)",
        headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }],
      },
    ];
  },
};

export default config;
