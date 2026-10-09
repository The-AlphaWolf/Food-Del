import {
  HoldPayoutRequestSchema,
  LocalDateString,
  PayoutListQuerySchema,
  PayoutRowSchema,
  PayoutSummarySchema,
} from "@food-del/domain/contracts";
import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import { type App, bearer, body, errors, json } from "./shared";

const tags = ["Payouts"];
const idParam = { params: z.object({ id: z.uuid() }) };
const staff = { 401: errors[401], 403: errors[403] };
const action = { ...staff, 404: errors[404], 409: errors[409] };

/** Ops console: what kitchens are owed, what's stuck, and the statement finance reconciles. */
export function registerPayoutRoutes(app: App) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/ops/payouts/summary",
      tags,
      security: bearer,
      summary: "Owed, stuck, paid and clawed back, overall and per kitchen",
      request: {
        query: z.object({ days: z.coerce.number().int().min(1).max(366).default(30) }),
      },
      responses: { 200: json(PayoutSummarySchema), ...staff },
    }),
    async (c) =>
      c.json(await c.get("core").payouts.summary(c.get("viewer"), c.req.valid("query").days), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/ops/payouts",
      tags,
      security: bearer,
      summary: "Payouts with where each one stands",
      request: { query: PayoutListQuerySchema },
      responses: { 200: json(z.array(PayoutRowSchema)), ...staff },
    }),
    async (c) =>
      c.json(await c.get("core").payouts.list(c.get("viewer"), c.req.valid("query")), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/ops/payouts/statement",
      tags,
      security: bearer,
      summary: "CSV statement of payouts created in a period (one line per parcel)",
      request: {
        query: z.object({
          from: LocalDateString,
          to: LocalDateString,
          vendorId: z.uuid().optional(),
        }),
      },
      responses: {
        200: {
          content: { "text/csv": { schema: z.string() } },
          description: "CSV, amounts in rupees",
        },
        ...staff,
      },
    }),
    async (c) => {
      const q = c.req.valid("query");
      const csv = await c.get("core").payouts.statementCsv(c.get("viewer"), q);
      return c.body(csv, 200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payouts-${q.from}-to-${q.to}.csv"`,
      });
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/ops/payouts/{id}/hold",
      tags,
      security: bearer,
      summary: "Hold a payout for review (the release job skips it)",
      request: { ...idParam, ...body(HoldPayoutRequestSchema) },
      responses: { 200: json(PayoutRowSchema), ...action, 422: errors[422] },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .payouts.hold(c.get("viewer"), c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/ops/payouts/{id}/resume",
      tags,
      security: bearer,
      summary: "Lift a review hold",
      request: idParam,
      responses: { 200: json(PayoutRowSchema), ...action },
    }),
    async (c) =>
      c.json(await c.get("core").payouts.resume(c.get("viewer"), c.req.valid("param").id), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/ops/payouts/{id}/retry",
      tags,
      security: bearer,
      summary: "Retry a payout's transfer, or a clawback's reversal, now",
      request: idParam,
      responses: { 200: json(PayoutRowSchema), ...action },
    }),
    async (c) =>
      c.json(await c.get("core").payouts.retry(c.get("viewer"), c.req.valid("param").id), 200),
  );
}
