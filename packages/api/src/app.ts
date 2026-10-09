import type { Core } from "@food-del/core";
import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { TokenService, viewerMiddleware } from "./auth";
import { type ApiConfig, type ApiEnv, DEFAULT_API_CONFIG } from "./env";
import { onError, problem } from "./errors";
import { registerAccountRoutes } from "./routes/account";
import { registerDevRoutes } from "./routes/dev";
import { registerOnboardingRoutes } from "./routes/onboarding";
import { registerOpsRoutes } from "./routes/ops";
import { registerOrderRoutes } from "./routes/orders";
import { registerPayoutRoutes } from "./routes/payouts";
import { registerPublicRoutes } from "./routes/public";
import { registerVendorRoutes } from "./routes/vendor";
import { registerWebhookRoutes } from "./routes/webhooks";
import { rateLimit, requireAudience, sameOriginForCookies } from "./security";

export const API_VERSION = "1.0.0";

/**
 * The HTTP API as a library: mount it in Next.js (Phase 1) or serve it standalone (Phase 2)
 * without changes. Every client — web, mobile, partners — talks to this one versioned contract.
 */
export function createApi(core: Core, input: Partial<ApiConfig> & Pick<ApiConfig, "auth">) {
  const config: ApiConfig = { ...DEFAULT_API_CONFIG, ...input };
  const tokens = new TokenService(config);

  const app = new OpenAPIHono<ApiEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return problem(c, 422, "VALIDATION_FAILED", "Some fields need attention.", {
          details: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
    },
  }).basePath(config.basePath);

  app.use("*", requestId());
  app.use("*", secureHeaders({ crossOriginResourcePolicy: false }));
  app.use("*", async (c, next) => {
    c.header("X-API-Version", API_VERSION);
    await next();
  });
  app.use("*", viewerMiddleware(core, tokens, config));
  app.use("*", sameOriginForCookies(config.sessionCookieName));
  app.onError(onError);

  // Access by route family, checked before any input is parsed.
  app.use("/v1/ops/*", requireAudience("staff"));
  app.use("/v1/vendor/*", requireAudience("kitchen"));
  for (const path of ["/v1/me", "/v1/me/*", "/v1/orders", "/v1/orders/*", "/v1/shipments/*"]) {
    app.use(path, requireAudience("signed-in"));
  }

  // Rate limits on abuse-prone endpoints (Postgres-backed, shared by every instance).
  const limits = config.rateLimits ?? {};
  app.post("/v1/auth/otp", rateLimit("otp", limits));
  app.post("/v1/auth/verify", rateLimit("otpVerify", limits));
  app.post("/v1/orders", rateLimit("orders", limits));
  app.post("/v1/orders/:id/payment", rateLimit("payments", limits));
  app.post("/v1/shipments/:id/claims", rateLimit("claims", limits));
  app.post("/v1/quotes", rateLimit("planning", limits));
  app.get("/v1/availability", rateLimit("planning", limits));
  app.get("/v1/pincodes/:pincode", rateLimit("pincodes", limits));
  app.get("/v1/me/export", rateLimit("exports", limits));
  app.notFound((c) => problem(c, 404, "NOT_FOUND", "No such endpoint."));

  registerPublicRoutes(app);
  registerAccountRoutes(app, tokens, config);
  registerOrderRoutes(app);
  registerVendorRoutes(app);
  registerOpsRoutes(app);
  registerOnboardingRoutes(app);
  registerPayoutRoutes(app);
  registerWebhookRoutes(app, config);
  if (config.devTools) registerDevRoutes(app, config);

  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Supabase session token (production) or development session token",
  });
  app.doc31("/v1/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Food-Del API",
      version: API_VERSION,
      description:
        "Cross-city delicacy delivery for India. Amounts are integer paise; dates are IST calendar dates (YYYY-MM-DD); " +
        "timestamps are ISO-8601 UTC. Errors are RFC 9457 problem+json with a stable `code`. Changes within v1 are additive.",
    },
  });
  app.get("/v1/docs", swaggerUI({ url: `${config.basePath}/v1/openapi.json` }));

  return app;
}

export type Api = ReturnType<typeof createApi>;
