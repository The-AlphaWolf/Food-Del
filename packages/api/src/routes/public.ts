import {
  AvailabilityQuerySchema,
  AvailabilitySchema,
  CategorySchema,
  CitySchema,
  ItemCardSchema,
  ItemDetailSchema,
  ItemListQuerySchema,
  Pincode,
  PincodeLookupSchema,
  QuoteRequestSchema,
  QuoteSchema,
  VendorDetailSchema,
} from "@food-del/domain/contracts";
import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import { type App, body, errors, json } from "./shared";

const tags = ["Catalogue"];

export function registerPublicRoutes(app: App) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/health",
      tags: ["System"],
      summary: "Liveness and database check",
      responses: { 200: json(z.object({ ok: z.literal(true), time: z.string() })) },
    }),
    async (c) => c.json(await c.get("core").health(), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/cities",
      tags,
      summary: "Launch cities (origins and destinations)",
      responses: { 200: json(z.array(CitySchema)) },
    }),
    async (c) => {
      c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
      return c.json(await c.get("core").catalog.listCities(), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/categories",
      tags,
      summary: "Delicacy categories",
      responses: { 200: json(z.array(CategorySchema)) },
    }),
    async (c) => {
      c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
      return c.json(await c.get("core").catalog.listCategories(), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/pincodes/{pincode}",
      tags: ["Serviceability"],
      summary: "Can we deliver to this pincode?",
      request: { params: z.object({ pincode: Pincode }) },
      responses: { 200: json(PincodeLookupSchema), 422: errors[422] },
    }),
    async (c) =>
      c.json(await c.get("core").serviceability.lookupPincode(c.req.valid("param").pincode), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/items",
      tags,
      summary: "Browse delicacies; pass a pincode to get earliest delivery on each card",
      request: { query: ItemListQuerySchema },
      responses: { 200: json(z.array(ItemCardSchema)), 422: errors[422] },
    }),
    async (c) => c.json(await c.get("core").catalog.listItems(c.req.valid("query")), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/items/{slug}",
      tags,
      summary: "Delicacy detail with freshness profile and legal declarations",
      request: {
        params: z.object({ slug: z.string() }),
        query: z.object({ pincode: Pincode.optional() }),
      },
      responses: { 200: json(ItemDetailSchema), 404: errors[404] },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .catalog.getItem(c.req.valid("param").slug, c.req.valid("query").pincode),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/vendors/{slug}",
      tags,
      summary: "A kitchen and its delicacies",
      request: {
        params: z.object({ slug: z.string() }),
        query: z.object({ pincode: Pincode.optional() }),
      },
      responses: { 200: json(VendorDetailSchema), 404: errors[404] },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .catalog.getVendor(c.req.valid("param").slug, c.req.valid("query").pincode),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/availability",
      tags: ["Serviceability"],
      summary: "Delivery-date calendar for one variant to one pincode",
      request: { query: AvailabilityQuerySchema },
      responses: { 200: json(AvailabilitySchema), 404: errors[404], 422: errors[422] },
    }),
    async (c) => c.json(await c.get("core").serviceability.availability(c.req.valid("query")), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/quotes",
      tags: ["Checkout"],
      summary: "Plan and price a cart: parcels, dispatch dates, cold chain and fees",
      request: body(QuoteRequestSchema),
      responses: { 200: json(QuoteSchema), 422: errors[422] },
    }),
    async (c) => c.json(await c.get("core").quotes.quote(c.req.valid("json")), 200),
  );
}
