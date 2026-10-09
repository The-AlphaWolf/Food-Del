import { invalid } from "@food-del/core";
import {
  AddressInputSchema,
  AddressSchema,
  MeSchema,
  OtpRequestSchema,
  OtpResponseSchema,
  SessionSchema,
  UpdateMeRequestSchema,
  VerifyOtpRequestSchema,
} from "@food-del/domain/contracts";
import { createRoute } from "@hono/zod-openapi";
import { deleteCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { TokenService } from "../auth";
import type { ApiConfig } from "../env";
import { type App, bearer, body, errors, json } from "./shared";

/** Fixed code for development logins; production OTPs are sent by Supabase Auth via MSG91. */
export const DEV_OTP = "123456";

export function registerAccountRoutes(app: App, tokens: TokenService, config: ApiConfig) {
  const tags = ["Account"];

  if (config.auth.mode === "dev") {
    app.openapi(
      createRoute({
        method: "post",
        path: "/v1/auth/otp",
        tags,
        summary: "Development only: start a phone login",
        request: body(OtpRequestSchema),
        responses: { 200: json(OtpResponseSchema), 422: errors[422] },
      }),
      async (c) => {
        await c.get("core").accounts.profileForPhone(c.req.valid("json").phone);
        return c.json({ sent: true as const, devCode: DEV_OTP }, 200);
      },
    );

    app.openapi(
      createRoute({
        method: "post",
        path: "/v1/auth/verify",
        tags,
        summary: "Development only: finish a phone login and receive a session",
        request: body(VerifyOtpRequestSchema),
        responses: { 200: json(SessionSchema), 422: errors[422] },
      }),
      async (c) => {
        const { phone, code } = c.req.valid("json");
        if (code !== DEV_OTP)
          throw invalid("INVALID_OTP", "That code isn't right. Please try again.");
        const core = c.get("core");
        const userId = await core.accounts.profileForPhone(phone);
        const session = await tokens.issueDevSession(userId, phone);
        setCookie(c, config.sessionCookieName, session.token, {
          httpOnly: true,
          secure: config.secureCookies,
          sameSite: "Lax",
          path: "/",
          expires: session.expiresAt,
        });
        const viewer = await core.accounts.resolveViewer(userId);
        return c.json(
          {
            token: session.token,
            expiresAt: session.expiresAt.toISOString(),
            user: await core.accounts.me(viewer),
          },
          200,
        );
      },
    );
  }

  app.post("/v1/auth/logout", (c) => {
    deleteCookie(c, config.sessionCookieName, { path: "/" });
    return c.body(null, 204);
  });

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/me",
      tags,
      security: bearer,
      summary: "The signed-in person, their roles and kitchens",
      responses: { 200: json(MeSchema), 401: errors[401] },
    }),
    async (c) => c.json(await c.get("core").accounts.me(c.get("viewer")), 200),
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/v1/me",
      tags,
      security: bearer,
      summary: "Update name or email",
      request: body(UpdateMeRequestSchema),
      responses: { 200: json(MeSchema), 401: errors[401], 422: errors[422] },
    }),
    async (c) =>
      c.json(await c.get("core").accounts.updateMe(c.get("viewer"), c.req.valid("json")), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/me/addresses",
      tags,
      security: bearer,
      summary: "Saved delivery addresses",
      responses: { 200: json(z.array(AddressSchema)), 401: errors[401] },
    }),
    async (c) => c.json(await c.get("core").accounts.listAddresses(c.get("viewer")), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/me/addresses",
      tags,
      security: bearer,
      summary: "Save an address",
      request: body(AddressInputSchema),
      responses: { 201: json(AddressSchema, "Created"), 401: errors[401], 422: errors[422] },
    }),
    async (c) =>
      c.json(await c.get("core").accounts.addAddress(c.get("viewer"), c.req.valid("json")), 201),
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/v1/me/addresses/{id}",
      tags,
      security: bearer,
      summary: "Delete a saved address",
      request: { params: z.object({ id: z.string() }) },
      responses: { 204: { description: "Deleted" }, 401: errors[401], 404: errors[404] },
    }),
    async (c) => {
      await c.get("core").accounts.deleteAddress(c.get("viewer"), c.req.valid("param").id);
      return c.body(null, 204);
    },
  );
}
