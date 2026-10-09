import {
  ClaimSchema,
  CreateClaimRequestSchema,
  OrderDetailSchema,
  OrderSummarySchema,
  PlaceOrderRequestSchema,
  PlaceOrderResponseSchema,
  VerifyPaymentRequestSchema,
} from "@food-del/domain/contracts";
import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import { type App, bearer, body, errors, json } from "./shared";

const tags = ["Orders"];
const idParam = { params: z.object({ id: z.string() }) };

export function registerOrderRoutes(app: App) {
  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/orders",
      tags,
      security: bearer,
      summary: "Place an order: re-plans every parcel, holds stock, opens a payment",
      description:
        "Send an `Idempotency-Key` header (a UUID per checkout attempt) so retries never double-book. " +
        "Pass `expectedTotalPaise` from the quote; if anything changed the API answers 409 PRICE_CHANGED with a fresh quote.",
      request: {
        ...body(PlaceOrderRequestSchema),
        headers: z.object({ "idempotency-key": z.string().min(8).max(100).optional() }),
      },
      responses: {
        201: json(PlaceOrderResponseSchema, "Order held; pay with the returned checkout"),
        401: errors[401],
        409: errors[409],
        422: errors[422],
      },
    }),
    async (c) => {
      const key = c.req.valid("header")["idempotency-key"];
      const result = await c.get("core").orders.place(c.get("viewer"), c.req.valid("json"), key);
      return c.json(result, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/orders",
      tags,
      security: bearer,
      summary: "My orders",
      responses: { 200: json(z.array(OrderSummarySchema)), 401: errors[401] },
    }),
    async (c) => c.json(await c.get("core").orders.list(c.get("viewer")), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/orders/{id}",
      tags,
      security: bearer,
      summary: "Order detail with per-parcel timeline",
      request: idParam,
      responses: { 200: json(OrderDetailSchema), 401: errors[401], 404: errors[404] },
    }),
    async (c) =>
      c.json(await c.get("core").orders.get(c.get("viewer"), c.req.valid("param").id), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/orders/{id}/payment",
      tags,
      security: bearer,
      summary: "Get (or re-create) the payment checkout for an unpaid order",
      request: idParam,
      responses: { 200: json(PlaceOrderResponseSchema), 401: errors[401], 404: errors[404] },
    }),
    async (c) =>
      c.json(
        await c.get("core").orders.retryPayment(c.get("viewer"), c.req.valid("param").id),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/orders/{id}/payment/verify",
      tags,
      security: bearer,
      summary: "Confirm a payment with the checkout widget's signature",
      request: { ...idParam, ...body(VerifyPaymentRequestSchema) },
      responses: {
        200: json(OrderDetailSchema),
        401: errors[401],
        404: errors[404],
        422: errors[422],
      },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .orders.verifyCheckout(c.get("viewer"), c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/orders/{id}/cancel",
      tags,
      security: bearer,
      summary: "Cancel every parcel still before its kitchen's cutoff",
      request: idParam,
      responses: {
        200: json(OrderDetailSchema),
        401: errors[401],
        404: errors[404],
        409: errors[409],
      },
    }),
    async (c) =>
      c.json(await c.get("core").orders.cancel(c.get("viewer"), c.req.valid("param").id), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/shipments/{id}/claims",
      tags,
      security: bearer,
      summary: "Report a problem with a delivered parcel",
      request: { ...idParam, ...body(CreateClaimRequestSchema) },
      responses: {
        201: json(ClaimSchema, "Created"),
        401: errors[401],
        409: errors[409],
        422: errors[422],
      },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .claims.create(c.get("viewer"), c.req.valid("param").id, c.req.valid("json")),
        201,
      ),
  );
}
