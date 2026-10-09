import type { Core } from "@food-del/core";
import { OpenAPIHono } from "@hono/zod-openapi";

export interface ApiConfig {
  /** Public base path the app is mounted under (e.g. "/api"). */
  basePath: string;
}

/** The HTTP API as a library: mount it in Next.js or serve it standalone. */
export function createApi(core: Core, config: ApiConfig = { basePath: "/api" }) {
  const app = new OpenAPIHono().basePath(config.basePath);

  app.get("/v1/health", async (c) => c.json(await core.health()));

  return app;
}

export type Api = ReturnType<typeof createApi>;
