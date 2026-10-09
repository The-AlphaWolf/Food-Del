import "server-only";

/**
 * Server configuration from the environment. Production refuses to start with development
 * shortcuts (fake payments, dev logins) unless explicitly allowed for a demo deployment.
 */
export interface ServerEnv {
  databaseUrl: string;
  appUrl: string;
  isProduction: boolean;
  allowDemo: boolean;
  auth:
    | { mode: "dev"; devSecret: string }
    | { mode: "supabase"; supabaseUrl: string; jwtSecret?: string };
  payments:
    | { provider: "fake" }
    | { provider: "razorpay"; keyId: string; keySecret: string; webhookSecret: string };
  carrier:
    | { provider: "fake" }
    | {
        provider: "shiprocket";
        email: string;
        password: string;
        webhookToken: string;
        courierIds: Record<string, number>;
      };
  messaging: {
    msg91?: { authKey: string; templateIds: Record<string, string> };
    whatsapp?: {
      accessToken: string;
      phoneNumberId: string;
      templateNames: Record<string, string>;
    };
    resend?: { apiKey: string; from: string };
  };
  devTools: boolean;
  cronSecret: string | null;
  opsPhone: string | null;
  opsEmail: string | null;
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return v;
}

function json<T>(name: string, fallback: T): T {
  const v = process.env[name];
  if (!v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
}

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const isProduction =
    process.env.NODE_ENV === "production" && process.env.FOOD_DEL_ENV !== "development";
  const allowDemo = process.env.ALLOW_DEMO_MODE === "1";

  const authMode = process.env.AUTH_MODE ?? "dev";
  const auth: ServerEnv["auth"] =
    authMode === "supabase"
      ? {
          mode: "supabase",
          supabaseUrl: req("SUPABASE_URL"),
          jwtSecret: process.env.SUPABASE_JWT_SECRET,
        }
      : {
          mode: "dev",
          devSecret: process.env.AUTH_DEV_SECRET ?? "dev-only-secret-change-me-0123456789abcdef",
        };

  const payments: ServerEnv["payments"] =
    process.env.PAYMENTS_PROVIDER === "razorpay"
      ? {
          provider: "razorpay",
          keyId: req("RAZORPAY_KEY_ID"),
          keySecret: req("RAZORPAY_KEY_SECRET"),
          webhookSecret: req("RAZORPAY_WEBHOOK_SECRET"),
        }
      : { provider: "fake" };

  const carrier: ServerEnv["carrier"] =
    process.env.CARRIER_PROVIDER === "shiprocket"
      ? {
          provider: "shiprocket",
          email: req("SHIPROCKET_EMAIL"),
          password: req("SHIPROCKET_PASSWORD"),
          webhookToken: req("SHIPROCKET_WEBHOOK_TOKEN"),
          courierIds: json("SHIPROCKET_COURIER_IDS", {}),
        }
      : { provider: "fake" };

  const env: ServerEnv = {
    databaseUrl: req("DATABASE_URL"),
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
    isProduction,
    allowDemo,
    auth,
    payments,
    carrier,
    messaging: {
      msg91: process.env.MSG91_AUTH_KEY
        ? { authKey: process.env.MSG91_AUTH_KEY, templateIds: json("MSG91_TEMPLATE_IDS", {}) }
        : undefined,
      whatsapp: process.env.WHATSAPP_ACCESS_TOKEN
        ? {
            accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
            phoneNumberId: req("WHATSAPP_PHONE_NUMBER_ID"),
            templateNames: json("WHATSAPP_TEMPLATE_NAMES", {}),
          }
        : undefined,
      resend: process.env.RESEND_API_KEY
        ? {
            apiKey: process.env.RESEND_API_KEY,
            from: process.env.EMAIL_FROM ?? "Food-Del <orders@food-del.in>",
          }
        : undefined,
    },
    devTools: process.env.DEV_TOOLS === "1" || (!isProduction && process.env.DEV_TOOLS !== "0"),
    cronSecret: process.env.CRON_SECRET ?? null,
    opsPhone: process.env.OPS_PHONE ?? null,
    opsEmail: process.env.OPS_EMAIL ?? null,
  };

  if (isProduction && !allowDemo) {
    const problems = [
      env.auth.mode === "dev" && "AUTH_MODE=dev",
      env.payments.provider === "fake" && "fake payments",
      env.carrier.provider === "fake" && "fake courier",
      env.devTools && "DEV_TOOLS",
      env.auth.mode === "dev" && !process.env.AUTH_DEV_SECRET && "default dev secret",
    ].filter(Boolean);
    if (problems.length > 0) {
      throw new Error(
        `Refusing to start in production with ${problems.join(", ")}. Configure real providers or set ALLOW_DEMO_MODE=1 for a demo.`,
      );
    }
  }
  cached = env;
  return env;
}
