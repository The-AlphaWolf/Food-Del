/**
 * Development tools, mounted only when `devTools` is on: pay for an order with the fake provider,
 * move a parcel along with the fake courier, print a label, and tick the schedulers.
 */
import { isStaff, notFound, requireViewer } from "@food-del/core";
import { SHIPMENT_STATUSES, type ShipmentStatus } from "@food-del/domain";
import { FakeCarrier, FakePaymentProvider } from "@food-del/integrations";
import { problem } from "../errors";
import type { App } from "./shared";

const TICK_JOBS = [
  "expire-holds",
  "lock-batches",
  "monitor-at-risk",
  "release-payouts",
  "process-outbox",
] as const;

export function registerDevRoutes(app: App) {
  app.post("/v1/dev/orders/:id/pay", async (c) => {
    const core = c.get("core");
    const viewer = requireViewer(c.get("viewer"));
    if (core.deps.payments.name !== "FAKE")
      return problem(c, 409, "NOT_FAKE", "Payments are not faked here.");
    const order = await core.orders.get(viewer, c.req.param("id"));
    const { checkout } = await core.orders.retryPayment(viewer, order.id);
    if (!checkout) return problem(c, 409, "NOT_PAYABLE", "This order isn't waiting for payment.");
    const { body, signature } = FakePaymentProvider.captureWebhook(
      checkout.providerOrderId,
      checkout.amountPaise,
    );
    // Exactly the path a real provider webhook takes.
    if (!core.deps.payments.verifyWebhook(body, signature))
      throw new Error("fake webhook failed verification");
    const event = core.deps.payments.parseWebhook(body);
    if (event) await core.orders.handlePaymentWebhook(event);
    await core.runJob("process-outbox");
    return c.json(await core.orders.get(viewer, order.id));
  });

  app.post("/v1/dev/shipments/:id/advance", async (c) => {
    const core = c.get("core");
    if (!isStaff(c.get("viewer"))) return problem(c, 403, "FORBIDDEN", "Ops only.");
    if (core.deps.carrier.name !== "fake")
      return problem(c, 409, "NOT_FAKE", "The courier is not faked here.");
    const { status } = (await c.req.json().catch(() => ({}))) as { status?: string };
    if (!status || !(SHIPMENT_STATUSES as readonly string[]).includes(status)) {
      return problem(c, 422, "INVALID_STATUS", "Pass a target status.");
    }
    const row = await core.ops.shipment(c.get("viewer"), c.req.param("id"));
    if (!row.awbNumber) throw notFound("Booked parcel");
    const outcomes = await core.tracking.applyCarrierEvents(
      core.deps.carrier.parseWebhook(
        FakeCarrier.event(row.awbNumber, status as ShipmentStatus, core.deps.clock()),
      ),
    );
    await core.runJob("process-outbox");
    return c.json({ outcomes });
  });

  app.post("/v1/dev/tick", async (c) => {
    const core = c.get("core");
    const results = [];
    for (const job of TICK_JOBS) results.push(await core.runJob(job));
    return c.json(results);
  });

  app.get("/v1/dev/labels/:awb", async (c) => {
    const awb = c.req.param("awb");
    if (!/^[A-Z0-9-]{6,40}$/.test(awb)) return problem(c, 422, "INVALID_AWB", "Bad AWB.");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Label ${awb}</title>
<style>@page{size:4in 6in;margin:0}body{font:14px/1.3 system-ui,sans-serif;margin:0}
.l{width:4in;height:6in;box-sizing:border-box;padding:.25in;border:2px dashed #999;display:flex;flex-direction:column;gap:.15in}
.awb{font:700 28px ui-monospace,monospace;letter-spacing:2px;border:3px solid #000;padding:.1in;text-align:center}
.bars{height:.9in;background:repeating-linear-gradient(90deg,#000 0 2px,#fff 2px 4px,#000 4px 7px,#fff 7px 9px)}
.warn{border:3px solid #000;padding:.08in;font-weight:800;text-align:center;text-transform:uppercase}</style></head>
<body><div class="l"><strong>FOOD-DEL · DEVELOPMENT LABEL</strong><div class="bars"></div><div class="awb">${awb}</div>
<div class="warn">Perishable — do not hold · Keep upright</div><small>Not valid for shipping. Real labels come from the courier.</small></div></body></html>`;
    return c.html(html);
  });

  app.get("/v1/dev/whoami", (c) => c.json({ viewer: c.get("viewer") }));
}
