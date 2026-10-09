import "server-only";
import { createApi } from "@food-del/api";
import { type Core, consoleLogger, createCore, DEFAULT_CONFIG } from "@food-del/core";
import { createDb } from "@food-del/db";
import {
  type CarrierProvider,
  ChannelRouter,
  FakeCarrier,
  FakePaymentProvider,
  Msg91Sms,
  type Notifier,
  type PaymentProvider,
  RazorpayProvider,
  RecordingNotifier,
  ResendEmail,
  ShiprocketProvider,
  WhatsAppCloud,
} from "@food-del/integrations";
import { serverEnv } from "./env";

/**
 * One core per server process. In development Next.js re-evaluates modules on every edit, so the
 * instance lives on globalThis to avoid leaking database pools.
 */
const globalForCore = globalThis as unknown as {
  foodDelCore?: Core;
  foodDelApi?: ReturnType<typeof createApi>;
};

function buildCore(): Core {
  const env = serverEnv();
  const payments: PaymentProvider =
    env.payments.provider === "razorpay"
      ? new RazorpayProvider({
          keyId: env.payments.keyId,
          keySecret: env.payments.keySecret,
          webhookSecret: env.payments.webhookSecret,
          brandName: "Food-Del",
        })
      : new FakePaymentProvider();
  const carrier: CarrierProvider =
    env.carrier.provider === "shiprocket"
      ? new ShiprocketProvider({
          email: env.carrier.email,
          password: env.carrier.password,
          webhookToken: env.carrier.webhookToken,
          courierIds: env.carrier.courierIds,
        })
      : new FakeCarrier("/api/v1/dev/labels");
  const { msg91, whatsapp, resend } = env.messaging;
  const notifier: Notifier =
    msg91 || whatsapp || resend
      ? new ChannelRouter({
          SMS: msg91 ? new Msg91Sms(msg91) : undefined,
          WHATSAPP: whatsapp ? new WhatsAppCloud(whatsapp) : undefined,
          EMAIL: resend ? new ResendEmail(resend) : undefined,
        })
      : new RecordingNotifier(!env.isProduction);

  const { db } = createDb(env.databaseUrl, { max: env.isProduction ? 5 : 10 });
  return createCore({
    db,
    clock: () => new Date(),
    payments,
    carrier,
    notifier,
    config: {
      ...DEFAULT_CONFIG,
      appUrl: env.appUrl,
      opsPhone: env.opsPhone,
      opsEmail: env.opsEmail,
    },
    logger: consoleLogger,
  });
}

export function getCore(): Core {
  if (!globalForCore.foodDelCore) globalForCore.foodDelCore = buildCore();
  return globalForCore.foodDelCore;
}

export function getApi() {
  if (!globalForCore.foodDelApi) {
    const env = serverEnv();
    globalForCore.foodDelApi = createApi(getCore(), {
      basePath: "/api",
      auth: env.auth,
      devTools: env.devTools,
      cronSecret: env.cronSecret,
      secureCookies: env.isProduction,
    });
  }
  return globalForCore.foodDelApi;
}
