import { ProblemSchema } from "@food-del/domain/contracts";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { z } from "zod";
import type { ApiEnv } from "../env";

export type App = OpenAPIHono<ApiEnv>;

export const json = <T extends z.ZodType>(schema: T, description = "OK") => ({
  content: { "application/json": { schema } },
  description,
});

export const body = <T extends z.ZodType>(schema: T) => ({
  body: { content: { "application/json": { schema } }, required: true },
});

const problemContent = { content: { "application/problem+json": { schema: ProblemSchema } } };

/** Documented error responses (all problem+json). */
export const errors = {
  401: { ...problemContent, description: "Sign in required" },
  403: { ...problemContent, description: "Not allowed" },
  404: { ...problemContent, description: "Not found" },
  409: { ...problemContent, description: "Conflict (sold out, cutoff passed, price changed…)" },
  422: { ...problemContent, description: "Invalid input" },
  429: { ...problemContent, description: "Too many requests (see Retry-After)" },
} as const;

export const bearer = [{ bearerAuth: [] }];
