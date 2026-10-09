import type { Core, RateLimitPolicy, Viewer } from "@food-del/core";

export type AuthConfig =
  | {
      /** Local development: OTP is always 123456, sessions are HS256 tokens signed with `devSecret`. */
      mode: "dev";
      devSecret: string;
    }
  | {
      /** Production: Supabase Auth issues sessions (phone OTP via MSG91); we verify against JWKS. */
      mode: "supabase";
      supabaseUrl: string;
      /** Legacy HS256 projects only; asymmetric (JWKS) keys are preferred. */
      jwtSecret?: string;
    };

export interface ApiConfig {
  /** Where the app is mounted, e.g. "/api". */
  basePath: string;
  auth: AuthConfig;
  /** Enables /v1/dev/* (fake payment capture, courier simulation, printable labels). */
  devTools: boolean;
  /** Shared secret for scheduled job triggers (Vercel Cron sends it as a Bearer token). */
  cronSecret: string | null;
  sessionCookieName: string;
  secureCookies: boolean;
  /** Override rate-limit policies by name, or `false` to switch them off (tests). */
  rateLimits?: Partial<Record<string, RateLimitPolicy>> | false;
  /** Verifies inbound payment/courier webhooks; defaults to the core's providers. */
  carrierWebhookProviders?: string[];
}

export const DEFAULT_API_CONFIG: Omit<ApiConfig, "auth"> = {
  basePath: "/api",
  devTools: false,
  cronSecret: null,
  sessionCookieName: "fd_session",
  secureCookies: true,
};

export interface ApiEnv {
  Variables: {
    core: Core;
    viewer: Viewer | null;
    requestId: string;
  };
}
