import { isLocalDate } from "@food-del/domain";
import {
  InventoryGridSchema,
  InventoryUpdateRequestSchema,
  LocalDateString,
  PackRequestSchema,
  ShortfallRequestSchema,
  VendorDaySchema,
  VendorOverviewSchema,
  VendorShipmentSchema,
} from "@food-del/domain/contracts";
import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import { type App, bearer, body, errors, json } from "./shared";

const tags = ["Vendor"];
const vendorParam = z.object({ vendorId: z.string() });

export function registerVendorRoutes(app: App) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/vendor/kitchens",
      tags,
      security: bearer,
      summary: "Kitchens I can manage",
      responses: {
        200: json(z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() }))),
        401: errors[401],
      },
    }),
    async (c) => c.json(await c.get("core").fulfilment.myVendors(c.get("viewer")), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/vendor/{vendorId}/overview",
      tags,
      security: bearer,
      summary: "The next week of dispatches and payouts",
      request: { params: vendorParam },
      responses: { 200: json(VendorOverviewSchema), 401: errors[401], 403: errors[403] },
    }),
    async (c) =>
      c.json(
        await c.get("core").fulfilment.overview(c.get("viewer"), c.req.valid("param").vendorId),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/vendor/{vendorId}/days/{date}",
      tags,
      security: bearer,
      summary: "Production sheet, packing list and parcels for one dispatch day",
      request: { params: vendorParam.extend({ date: LocalDateString }) },
      responses: { 200: json(VendorDaySchema), 401: errors[401], 403: errors[403] },
    }),
    async (c) => {
      const { vendorId, date } = c.req.valid("param");
      return c.json(await c.get("core").fulfilment.day(c.get("viewer"), vendorId, date), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/vendor/shipments/{id}/pack",
      tags,
      security: bearer,
      summary: "Mark a parcel packed; books the courier",
      request: { params: z.object({ id: z.string() }), ...body(PackRequestSchema) },
      responses: {
        200: json(VendorShipmentSchema),
        401: errors[401],
        403: errors[403],
        409: errors[409],
      },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .fulfilment.markPacked(c.get("viewer"), c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/vendor/shipments/{id}/shortfall",
      tags,
      security: bearer,
      summary: "Report that the kitchen can't make this parcel (customer is refunded)",
      request: { params: z.object({ id: z.string() }), ...body(ShortfallRequestSchema) },
      responses: {
        200: json(VendorShipmentSchema),
        401: errors[401],
        403: errors[403],
        409: errors[409],
      },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .fulfilment.reportShortfall(
            c.get("viewer"),
            c.req.valid("param").id,
            c.req.valid("json").note,
          ),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/vendor/{vendorId}/inventory",
      tags,
      security: bearer,
      summary: "Daily caps per item for the coming days",
      request: {
        params: vendorParam,
        query: z.object({
          from: LocalDateString.optional(),
          days: z.coerce.number().int().min(1).max(31).optional(),
        }),
      },
      responses: { 200: json(InventoryGridSchema), 401: errors[401], 403: errors[403] },
    }),
    async (c) => {
      const { from, days } = c.req.valid("query");
      return c.json(
        await c
          .get("core")
          .fulfilment.inventory(
            c.get("viewer"),
            c.req.valid("param").vendorId,
            from && isLocalDate(from) ? from : undefined,
            days,
          ),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/v1/vendor/{vendorId}/inventory",
      tags,
      security: bearer,
      summary: "Set daily caps",
      request: { params: vendorParam, ...body(InventoryUpdateRequestSchema) },
      responses: {
        200: json(InventoryGridSchema),
        401: errors[401],
        403: errors[403],
        409: errors[409],
      },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .fulfilment.updateInventory(
            c.get("viewer"),
            c.req.valid("param").vendorId,
            c.req.valid("json"),
          ),
        200,
      ),
  );
}
