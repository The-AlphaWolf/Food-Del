import { getApi } from "@/server/core";

/** Every /api/* request is served by the shared Hono app (packages/api). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = (req: Request) => getApi().fetch(req);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
