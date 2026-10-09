import { SHIPMENT_STATUSES } from "@food-del/domain";
import {
  BlackoutInputSchema,
  BlackoutSchema,
  ClaimSchema,
  LocalDateString,
  OpsCitySchema,
  OpsOverviewSchema,
  OpsShipmentRowSchema,
  OpsTransitionRequestSchema,
  OpsVendorSchema,
  ResolveClaimRequestSchema,
  UpdateCityRequestSchema,
  UpdateVendorRequestSchema,
} from "@food-del/domain/contracts";
import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import { type App, bearer, body, errors, json } from "./shared";

const tags = ["Operations"];
const idParam = { params: z.object({ id: z.string() }) };
const staff = { 401: errors[401], 403: errors[403] };

export function registerOpsRoutes(app: App) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/ops/overview",
      tags,
      security: bearer,
      summary: "Live counts and the exception queue",
      responses: { 200: json(OpsOverviewSchema), ...staff },
    }),
    async (c) => c.json(await c.get("core").ops.overview(c.get("viewer")), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/ops/shipments",
      tags,
      security: bearer,
      summary: "Search parcels",
      request: {
        query: z.object({
          status: z.enum(SHIPMENT_STATUSES).optional(),
          dispatchDate: LocalDateString.optional(),
          q: z.string().max(60).optional(),
          exceptions: z.enum(["true", "false"]).optional(),
        }),
      },
      responses: { 200: json(z.array(OpsShipmentRowSchema)), ...staff },
    }),
    async (c) => {
      const q = c.req.valid("query");
      return c.json(
        await c.get("core").ops.shipments(c.get("viewer"), {
          status: q.status,
          dispatchDate: q.dispatchDate,
          q: q.q,
          onlyExceptions: q.exceptions === "true",
        }),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/ops/shipments/{id}/transition",
      tags,
      security: bearer,
      summary: "Manually move a parcel (refund policy applied on cancel/fail)",
      request: { ...idParam, ...body(OpsTransitionRequestSchema) },
      responses: { 200: json(OpsShipmentRowSchema), ...staff, 409: errors[409] },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .ops.transition(c.get("viewer"), c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/ops/claims",
      tags,
      security: bearer,
      summary: "Quality claims",
      request: { query: z.object({ status: z.enum(["OPEN", "APPROVED", "REJECTED"]).optional() }) },
      responses: { 200: json(z.array(ClaimSchema)), ...staff },
    }),
    async (c) =>
      c.json(await c.get("core").claims.list(c.get("viewer"), c.req.valid("query").status), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/ops/claims/{id}/resolve",
      tags,
      security: bearer,
      summary: "Approve (refund/reship) or reject a claim",
      request: { ...idParam, ...body(ResolveClaimRequestSchema) },
      responses: { 200: json(ClaimSchema), ...staff, 409: errors[409] },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .claims.resolve(c.get("viewer"), c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/ops/blackouts",
      tags,
      security: bearer,
      summary: "Holidays and closures",
      responses: { 200: json(z.array(BlackoutSchema)), ...staff },
    }),
    async (c) => c.json(await c.get("core").ops.blackouts(c.get("viewer")), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/ops/blackouts",
      tags,
      security: bearer,
      summary: "Add a holiday or closure",
      request: body(BlackoutInputSchema),
      responses: { 200: json(z.array(BlackoutSchema)), ...staff, 422: errors[422] },
    }),
    async (c) =>
      c.json(await c.get("core").ops.addBlackout(c.get("viewer"), c.req.valid("json")), 200),
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/v1/ops/blackouts/{id}",
      tags,
      security: bearer,
      summary: "Remove a holiday or closure",
      request: idParam,
      responses: { 200: json(z.array(BlackoutSchema)), ...staff },
    }),
    async (c) =>
      c.json(await c.get("core").ops.removeBlackout(c.get("viewer"), c.req.valid("param").id), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/ops/cities",
      tags,
      security: bearer,
      summary: "Cities with coverage counts",
      responses: { 200: json(z.array(OpsCitySchema)), ...staff },
    }),
    async (c) => c.json(await c.get("core").ops.cities(c.get("viewer")), 200),
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/v1/ops/cities/{id}",
      tags,
      security: bearer,
      summary: "Launch, pause or re-role a city (data change, no deploy)",
      request: { ...idParam, ...body(UpdateCityRequestSchema) },
      responses: { 200: json(z.array(OpsCitySchema)), ...staff },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .ops.updateCity(c.get("viewer"), c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/ops/vendors",
      tags,
      security: bearer,
      summary: "Kitchens with compliance and reliability",
      responses: { 200: json(z.array(OpsVendorSchema)), ...staff },
    }),
    async (c) => c.json(await c.get("core").ops.vendors(c.get("viewer")), 200),
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/v1/ops/vendors/{id}",
      tags,
      security: bearer,
      summary: "Activate, pause or re-terms a kitchen",
      request: { ...idParam, ...body(UpdateVendorRequestSchema) },
      responses: { 200: json(z.array(OpsVendorSchema)), ...staff },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .ops.updateVendor(c.get("viewer"), c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
  );
}
