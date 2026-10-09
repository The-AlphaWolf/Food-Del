import { isStaff } from "@food-del/core";
import { JOB_NAMES, type JobName } from "@food-del/domain/contracts";
import type { Context } from "hono";
import type { ApiConfig, ApiEnv } from "../env";
import { problem } from "../errors";
import type { App } from "./shared";

/**
 * Inbound calls from providers and schedulers. These read the raw body (signatures are computed
 * over exact bytes), acknowledge quickly, and leave slow work to the outbox.
 */
export function registerWebhookRoutes(app: App, config: ApiConfig) {
  app.post("/v1/webhooks/payments", async (c) => {
    const core = c.get("core");
    const raw = await c.req.text();
    const signature = c.req.header("x-razorpay-signature") ?? c.req.header("x-signature") ?? null;
    if (!core.deps.payments.verifyWebhook(raw, signature)) {
      return problem(c, 401, "INVALID_SIGNATURE", "Webhook signature did not verify.");
    }
    const event = core.deps.payments.parseWebhook(raw);
    const outcome = event ? await core.orders.handlePaymentWebhook(event) : "ignored";
    return c.json({ received: true, outcome });
  });

  app.post("/v1/webhooks/carriers/:provider", async (c) => {
    const core = c.get("core");
    const raw = await c.req.text();
    if (c.req.param("provider") !== core.deps.carrier.name) {
      return problem(c, 404, "UNKNOWN_PROVIDER", "No such carrier integration.");
    }
    if (!core.deps.carrier.verifyWebhook(c.req.raw.headers, raw)) {
      return problem(c, 401, "INVALID_SIGNATURE", "Webhook token did not verify.");
    }
    const outcomes = await core.tracking.applyCarrierEvents(core.deps.carrier.parseWebhook(raw));
    return c.json({ received: true, outcomes });
  });

  /**
   * Scheduled jobs. Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET`; ops can
   * trigger the same jobs from the console.
   */
  const runJob = async (c: Context<ApiEnv, "/v1/jobs/:job">) => {
    const job = c.req.param("job") as JobName;
    if (!(JOB_NAMES as readonly string[]).includes(job))
      return problem(c, 404, "UNKNOWN_JOB", "No such job.");
    const auth = c.req.header("authorization") ?? "";
    const cronOk = config.cronSecret !== null && auth === `Bearer ${config.cronSecret}`;
    if (!cronOk && !isStaff(c.get("viewer")))
      return problem(c, 401, "UNAUTHENTICATED", "Not allowed.");
    const core = c.get("core");
    const result = await core.runJob(job);
    // Side effects of the job (notifications, courier bookings) go out right away.
    if (job !== "process-outbox") await core.runJob("process-outbox");
    return c.json(result);
  };
  app.get("/v1/jobs/:job", runJob);
  app.post("/v1/jobs/:job", runJob);
}
