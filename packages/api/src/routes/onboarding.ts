import {
  AddKitchenMemberRequestSchema,
  CreateCityRequestSchema,
  CreateKitchenRequestSchema,
  DirectoryDistrictSchema,
  ItemAdminDetailSchema,
  ItemInputSchema,
  KitchenDetailSchema,
  OnboardingOptionsSchema,
  OpsCitySchema,
  ReachPreviewRequestSchema,
  ReachPreviewSchema,
  RouteInputSchema,
  RouteSchema,
  SetItemStatusRequestSchema,
  UpdateKitchenRequestSchema,
} from "@food-del/domain/contracts";
import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import { type App, bearer, body, errors, json } from "./shared";

const tags = ["Onboarding"];
const idParam = { params: z.object({ id: z.uuid() }) };
const staff = { 401: errors[401], 403: errors[403] };
const writes = { ...staff, 404: errors[404], 409: errors[409], 422: errors[422] };

/** Ops console: bring kitchens, delicacies, routes and cities onto the platform. */
export function registerOnboardingRoutes(app: App) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/ops/onboarding/options",
      tags,
      security: bearer,
      summary: "Cities, categories, courier services and choices for the onboarding forms",
      responses: { 200: json(OnboardingOptionsSchema), ...staff },
    }),
    async (c) => c.json(await c.get("core").onboarding.options(c.get("viewer")), 200),
  );

  // ─── Kitchens ───────────────────────────────────────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/ops/kitchens",
      tags,
      security: bearer,
      summary: "Add a kitchen (starts in onboarding) and invite its owner",
      request: body(CreateKitchenRequestSchema),
      responses: { 201: json(KitchenDetailSchema, "Created"), ...writes },
    }),
    async (c) =>
      c.json(
        await c.get("core").onboarding.createKitchen(c.get("viewer"), c.req.valid("json")),
        201,
      ),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/ops/kitchens/{id}",
      tags,
      security: bearer,
      summary: "A kitchen with its people, delicacies and go-live checklist",
      request: idParam,
      responses: { 200: json(KitchenDetailSchema), ...staff, 404: errors[404] },
    }),
    async (c) =>
      c.json(await c.get("core").onboarding.kitchen(c.get("viewer"), c.req.valid("param").id), 200),
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/v1/ops/kitchens/{id}",
      tags,
      security: bearer,
      summary: "Edit a kitchen's details, schedule or terms",
      request: { ...idParam, ...body(UpdateKitchenRequestSchema) },
      responses: { 200: json(KitchenDetailSchema), ...writes },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .onboarding.updateKitchen(c.get("viewer"), c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/ops/kitchens/{id}/members",
      tags,
      security: bearer,
      summary: "Invite an owner or staff member by mobile number",
      request: { ...idParam, ...body(AddKitchenMemberRequestSchema) },
      responses: { 200: json(KitchenDetailSchema), ...writes },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .onboarding.addMember(c.get("viewer"), c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
  );

  // ─── Delicacies ─────────────────────────────────────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/ops/kitchens/{id}/items",
      tags,
      security: bearer,
      summary: "Draft a delicacy with its pack sizes",
      request: { ...idParam, ...body(ItemInputSchema) },
      responses: { 201: json(ItemAdminDetailSchema, "Created"), ...writes },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .onboarding.createItem(c.get("viewer"), c.req.valid("param").id, c.req.valid("json")),
        201,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/ops/kitchens/{id}/reach-preview",
      tags,
      security: bearer,
      summary: "Where a drafted delicacy could reach fresh from this kitchen",
      request: { ...idParam, ...body(ReachPreviewRequestSchema) },
      responses: { 200: json(ReachPreviewSchema), ...staff, 404: errors[404] },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .onboarding.reachPreview(c.get("viewer"), c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/ops/items/{id}",
      tags,
      security: bearer,
      summary: "A delicacy as ops edits it",
      request: idParam,
      responses: { 200: json(ItemAdminDetailSchema), ...staff, 404: errors[404] },
    }),
    async (c) =>
      c.json(await c.get("core").onboarding.item(c.get("viewer"), c.req.valid("param").id), 200),
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/v1/ops/items/{id}",
      tags,
      security: bearer,
      summary: "Edit a delicacy; pack sizes left out are retired",
      request: { ...idParam, ...body(ItemInputSchema) },
      responses: { 200: json(ItemAdminDetailSchema), ...writes },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .onboarding.updateItem(c.get("viewer"), c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/ops/items/{id}/status",
      tags,
      security: bearer,
      summary: "Put a delicacy on sale, pause or archive it",
      request: { ...idParam, ...body(SetItemStatusRequestSchema) },
      responses: { 200: json(ItemAdminDetailSchema), ...writes },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .onboarding.setItemStatus(c.get("viewer"), c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
  );

  // ─── Routes ─────────────────────────────────────────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/ops/routes",
      tags,
      security: bearer,
      summary: "Courier routes between cities",
      request: {
        query: z.object({
          originCityId: z.uuid().optional(),
          destinationCityId: z.uuid().optional(),
        }),
      },
      responses: { 200: json(z.array(RouteSchema)), ...staff },
    }),
    async (c) =>
      c.json(await c.get("core").onboarding.routes(c.get("viewer"), c.req.valid("query")), 200),
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/v1/ops/routes",
      tags,
      security: bearer,
      summary: "Create or update a route (applies to every pincode of the destination)",
      request: body(RouteInputSchema),
      responses: { 200: json(RouteSchema), ...writes },
    }),
    async (c) =>
      c.json(await c.get("core").onboarding.upsertRoute(c.get("viewer"), c.req.valid("json")), 200),
  );

  // ─── Cities ─────────────────────────────────────────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/ops/directory/districts",
      tags,
      security: bearer,
      summary: "Districts in the pincode directory not yet part of a city",
      request: { query: z.object({ stateCode: z.string().length(2).optional() }) },
      responses: { 200: json(z.array(DirectoryDistrictSchema)), ...staff },
    }),
    async (c) =>
      c.json(
        await c
          .get("core")
          .onboarding.directoryDistricts(c.get("viewer"), c.req.valid("query").stateCode),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/ops/cities",
      tags,
      security: bearer,
      summary: "Add a city (starts hidden) and claim its pincodes",
      request: body(CreateCityRequestSchema),
      responses: { 201: json(z.array(OpsCitySchema), "Created"), ...writes },
    }),
    async (c) => {
      const core = c.get("core");
      await core.onboarding.createCity(c.get("viewer"), c.req.valid("json"));
      return c.json(await core.ops.cities(c.get("viewer")), 201);
    },
  );
}
