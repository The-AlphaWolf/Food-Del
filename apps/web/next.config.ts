import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// One .env at the repo root configures the app and the database scripts. Values already set
// (the deployment's environment, apps/web/.env.local) are never overwritten.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
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
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
