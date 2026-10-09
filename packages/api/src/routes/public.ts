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
  ReadinessSchema,
  VendorDetailSchema,
} from "@food-del/domain/contracts";
import { createRoute } from "@hono/zod-openapi";
import type { Context } from "hono";
import { z } from "zod";
import { type App, body, errors, json } from "./shared";

const tags = ["Catalogue"];

/**
 * Let the CDN (not browsers) serve public reads for a short while. At festival peaks most
 * shoppers browse the same few pages; without this every one of them reaches a function and the
 * database. Stock and dates are re-checked when an order is placed, so a minute-old calendar
 * can only cost a shopper a "just sold out" message.
 */
function sharedCache(c: Context, seconds: number, staleSeconds = seconds * 5) {
  c.header(
    "Cache-Control",
    `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${staleSeconds}`,
  );
}

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
      path: "/v1/health/ready",
      tags: ["System"],
      summary: "Readiness for uptime monitors",
      description:
        "200 when the database answers and queued work is being processed on schedule; 503 otherwise. Ops see the detail at /v1/ops/health.",
      responses: { 200: json(ReadinessSchema), 503: json(ReadinessSchema) },
    }),
    async (c) => {
      c.header("Cache-Control", "no-store");
      const ready = await c.get("core").monitoring.ready();
      return ready ? c.json({ ready }, 200) : c.json({ ready }, 503);
    },
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
    async (c) => {
      const r = await c.get("core").serviceability.lookupPincode(c.req.valid("param").pincode);
      sharedCache(c, 3600);
      return c.json(r, 200);
    },
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
    async (c) => {
      const r = await c.get("core").catalog.listItems(c.req.valid("query"));
      sharedCache(c, 60);
      return c.json(r, 200);
    },
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
    async (c) => {
      const r = await c
        .get("core")
        .catalog.getItem(c.req.valid("param").slug, c.req.valid("query").pincode);
      sharedCache(c, 60);
      return c.json(r, 200);
    },
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
    async (c) => {
      const r = await c
        .get("core")
        .catalog.getVendor(c.req.valid("param").slug, c.req.valid("query").pincode);
      sharedCache(c, 60);
      return c.json(r, 200);
    },
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
    async (c) => {
      const r = await c.get("core").serviceability.availability(c.req.valid("query"));
      sharedCache(c, 30, 60);
      return c.json(r, 200);
    },
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
