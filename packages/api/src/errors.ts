import { DomainError } from "@food-del/core";
import type { Problem } from "@food-del/domain/contracts";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiEnv } from "./env";

export function problem(
  c: Context,
  status: number,
  code: string,
  title: string,
  extra: Partial<Problem> = {},
): Response {
  const body: Problem = {
    type: `https://food-del.in/problems/${code.toLowerCase().replace(/_/g, "-")}`,
    title,
    status,
    code,
    ...extra,
  };
  return c.body(JSON.stringify(body), status as ContentfulStatusCode, {
    "Content-Type": "application/problem+json",
  });
}

/** Every error becomes RFC 9457 problem+json with a stable `code`. */
export function onError(err: Error, c: Context<ApiEnv>): Response {
  if (err instanceof DomainError) {
    return problem(
      c,
      err.status,
      err.code,
      err.message,
      err.details === undefined ? {} : { details: err.details },
    );
  }
  // Client mistakes Hono catches before our handlers (malformed JSON, a body cut off by a client
  // that gave up): answer with their 4xx, and don't page anyone.
  if (err instanceof HTTPException && err.status < 500) {
    return problem(
      c,
      err.status,
      err.status === 400 ? "MALFORMED_REQUEST" : "REQUEST_REJECTED",
      err.status === 400 ? "The request body isn't valid JSON." : err.message,
    );
  }
  const core = c.get("core");
  core?.deps.logger.error("unhandled API error", {
    requestId: c.get("requestId"),
    path: c.req.path,
    error: err.message,
    stack: err.stack,
  });
  return problem(c, 500, "INTERNAL", "Something went wrong on our side. Please try again.", {
    detail: `Reference ${c.get("requestId") ?? "unknown"}`,
  });
}
