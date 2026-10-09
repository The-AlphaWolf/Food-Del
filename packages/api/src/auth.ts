/**
 * Sessions. Web and mobile send the same JWT — mobile as `Authorization: Bearer`, the web app via
 * an httpOnly cookie as well — so no endpoint assumes a browser.
 */
import type { Core, Logger, Viewer } from "@food-del/core";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { createRemoteJWKSet, type JWTPayload, jwtVerify, SignJWT } from "jose";
import type { ApiConfig, ApiEnv, AuthConfig } from "./env";

const DEV_ISSUER = "food-del-dev";
const SESSION_DAYS = 30;

export interface Session {
  token: string;
  expiresAt: Date;
}

export class TokenService {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet> | null;
  private readonly secret: Uint8Array | null;

  constructor(private readonly config: ApiConfig) {
    if (config.auth.mode === "supabase") {
      this.jwks = createRemoteJWKSet(
        new URL(`${config.auth.supabaseUrl}/auth/v1/.well-known/jwks.json`),
      );
      this.secret = config.auth.jwtSecret ? new TextEncoder().encode(config.auth.jwtSecret) : null;
    } else {
      this.jwks = null;
      this.secret = new TextEncoder().encode(config.auth.devSecret);
    }
  }

  /** Development sessions only; production sessions come from Supabase. */
  async issueDevSession(userId: string, phone: string): Promise<Session> {
    if (this.config.auth.mode !== "dev" || !this.secret)
      throw new Error("dev sessions are disabled");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    const token = await new SignJWT({ phone })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer(DEV_ISSUER)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.secret);
    return { token, expiresAt };
  }

  /** Verified claims, or null for a missing/invalid/expired token. */
  async verify(token: string): Promise<JWTPayload | null> {
    try {
      if (this.config.auth.mode === "dev") {
        const { payload } = await jwtVerify(token, this.secret!, { issuer: DEV_ISSUER });
        return payload;
      }
      const issuer = `${this.config.auth.supabaseUrl}/auth/v1`;
      const header = JSON.parse(
        Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8"),
      ) as { alg?: string };
      const { payload } =
        header.alg === "HS256" && this.secret
          ? await jwtVerify(token, this.secret, { issuer, audience: "authenticated" })
          : await jwtVerify(token, this.jwks!, { issuer, audience: "authenticated" });
      return payload;
    } catch {
      return null;
    }
  }
}

export function readToken(c: Context, cookieName: string): string | null {
  const header = c.req.header("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim() || null;
  return getCookie(c, cookieName) ?? null;
}

/** Resolve the caller (if any) once per request. Never rejects: routes decide what they need. */
export function viewerMiddleware(
  core: Core,
  tokens: TokenService,
  config: ApiConfig,
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    c.set("core", core);
    let viewer: Viewer | null = null;
    const token = readToken(c, config.sessionCookieName);
    if (token) {
      const claims = await tokens.verify(token);
      if (claims?.sub) {
        viewer = await core.accounts.resolveViewer(claims.sub);
        if (!viewer && config.auth.mode === "supabase") {
          await core.accounts.ensureProfile({
            id: claims.sub,
            phone: typeof claims.phone === "string" ? claims.phone : null,
            email: typeof claims.email === "string" ? claims.email : null,
          });
          viewer = await core.accounts.resolveViewer(claims.sub);
        }
      }
    }
    c.set("viewer", viewer);
    await next();
  };
}

/**
 * Remove the Supabase login after an account is erased, so the phone number can sign up afresh
 * and no orphaned credential remains. Needs the service-role key; without it, ops removes the
 * user from the Supabase dashboard (the erased profile already refuses sign-in).
 */
export async function deleteSupabaseUser(
  auth: Extract<AuthConfig, { mode: "supabase" }>,
  userId: string,
  logger: Logger,
): Promise<void> {
  if (!auth.serviceRoleKey) {
    logger.warn("supabase user not removed: SUPABASE_SERVICE_ROLE_KEY not set", { userId });
    return;
  }
  try {
    const res = await fetch(`${auth.supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: auth.serviceRoleKey, Authorization: `Bearer ${auth.serviceRoleKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    logger.error("supabase user removal failed", {
      userId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
