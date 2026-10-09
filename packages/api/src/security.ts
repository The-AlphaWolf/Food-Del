/**
 * Request-level protections that don't belong to any one use-case: access guards by route
 * family (checked before input validation, so nobody learns a route's shape without access),
 * a same-origin check for cookie sessions, and rate limits on abuse-prone endpoints.
 */
import { timingSafeEqual } from "node:crypto";
import { isStaff, type RateLimitPolicy } from "@food-del/core";
import type { Context, MiddlewareHandler } from "hono";
import type { ApiEnv } from "./env";
import { problem } from "./errors";

export const RATE_LIMIT_POLICIES = {
  /** Development OTP sign-in (production OTP is rate-limited by Supabase Auth). */
  otp: { limit: 20, windowSeconds: 15 * 60 },
  otpVerify: { limit: 30, windowSeconds: 15 * 60 },
  /** Placing orders holds stock, so a script could starve a kitchen's capacity. */
  orders: { limit: 20, windowSeconds: 60 * 60 },
  payments: { limit: 30, windowSeconds: 60 * 60 },
  claims: { limit: 10, windowSeconds: 24 * 60 * 60 },
  /** Quotes and calendars run the planner: the most expensive public reads. */
  planning: { limit: 120, windowSeconds: 60 },
  pincodes: { limit: 60, windowSeconds: 60 },
} satisfies Record<string, RateLimitPolicy>;
export type RateLimitName = keyof typeof RATE_LIMIT_POLICIES;

/** Constant-time comparison for shared secrets (cron triggers). */
export function secretMatches(given: string | undefined, expected: string | null): boolean {
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The caller's address. On Vercel `x-real-ip` and the first `x-forwarded-for` hop are set by the
 * platform, not the client.
 */
export function clientIp(c: Context): string {
  return (
    c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  );
}

type Audience = "signed-in" | "kitchen" | "staff";

/** Refuse a whole route family to the wrong audience before any input is read. */
export function requireAudience(audience: Audience): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const viewer = c.get("viewer");
    if (!viewer) return problem(c, 401, "UNAUTHENTICATED", "Please sign in to continue.");
    const allowed =
      audience === "signed-in" ||
      isStaff(viewer) ||
      (audience === "kitchen" &&
        viewer.roles.some((r) => r === "VENDOR_OWNER" || r === "VENDOR_STAFF"));
    if (!allowed) return problem(c, 403, "FORBIDDEN", "You don't have access to this.");
    await next();
  };
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cookie sessions are sent by the browser on any request, so a write that relies on the cookie
 * must come from our own pages. Bearer-token clients (mobile, partners) aren't affected.
 */
export function sameOriginForCookies(cookieName: string): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const usesCookie =
      !SAFE_METHODS.has(c.req.method) &&
      !c.req.header("authorization") &&
      (c.req.header("cookie") ?? "").includes(`${cookieName}=`);
    if (usesCookie) {
      const site = c.req.header("sec-fetch-site");
      const origin = c.req.header("origin");
      const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
      let crossSite = site === "cross-site";
      if (origin !== undefined) {
        try {
          crossSite ||= origin === "null" || new URL(origin).host !== host;
        } catch {
          crossSite = true;
        }
      }
      if (crossSite) {
        return problem(c, 403, "CROSS_SITE_REQUEST", "This request didn't come from Food-Del.");
      }
    }
    await next();
  };
}

/**
 * Count the request against a policy, keyed by signed-in user when there is one, else by IP.
 * Over the limit: 429 with Retry-After. Limits are skipped when disabled in config (tests).
 */
export function rateLimit(
  name: RateLimitName,
  policies: Partial<Record<RateLimitName, RateLimitPolicy>> | false,
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const policy = policies === false ? null : (policies[name] ?? RATE_LIMIT_POLICIES[name]);
    if (!policy) return next();
    const viewer = c.get("viewer");
    const key = viewer ? `${name}:user:${viewer.userId}` : `${name}:ip:${clientIp(c)}`;
    const r = await c.get("core").rateLimits.hit(key, policy);
    c.header("RateLimit-Limit", String(policy.limit));
    c.header("RateLimit-Remaining", String(r.remaining));
    c.header("RateLimit-Reset", String(r.resetSeconds));
    if (!r.allowed) {
      c.header("Retry-After", String(r.resetSeconds));
      return problem(
        c,
        429,
        "RATE_LIMITED",
        "Too many requests. Please wait a moment and try again.",
      );
    }
    await next();
  };
}
