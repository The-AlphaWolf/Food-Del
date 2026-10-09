import { describe, expect, it } from "vitest";
import { createApiClient } from "./client";
import { ApiError } from "./errors";

function fakeFetch(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) {
  return (async (url: string, init?: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return new Response(body === null ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

describe("api client", () => {
  it("sends bearer tokens, idempotency keys and the client version", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const api = createApiClient({
      baseUrl: "https://x.test/api",
      getToken: () => "tok",
      clientVersion: "ios-1.0.0",
      fetch: fakeFetch(201, { order: { id: "o1" }, checkout: null }, seen),
    });
    await api.placeOrder(
      {
        pincode: "560001",
        shipTo: { recipientName: "A B", phone: "9876543210", line1: "x y z" },
        lines: [],
      },
      "key-1",
    );
    const headers = seen.init!.headers as Record<string, string>;
    expect(seen.url).toBe("https://x.test/api/v1/orders");
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["Idempotency-Key"]).toBe("key-1");
    expect(headers["X-Client-Version"]).toBe("ios-1.0.0");
  });

  it("drops empty query params", async () => {
    const seen: { url?: string } = {};
    const api = createApiClient({ baseUrl: "/api", fetch: fakeFetch(200, [], seen) });
    await api.items({ origin: "kolkata", q: "", pincode: undefined });
    expect(seen.url).toBe("/api/v1/items?origin=kolkata");
  });

  it("turns problem+json into ApiError with field errors", async () => {
    const api = createApiClient({
      baseUrl: "/api",
      fetch: fakeFetch(422, {
        code: "VALIDATION_FAILED",
        title: "Some fields need attention.",
        status: 422,
        details: [{ path: "shipTo.phone", message: "Too short" }],
      }),
    });
    const err = await api.quote({ pincode: "560001", lines: [] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).fieldErrors).toEqual({ "shipTo.phone": "Too short" });
  });

  it("reports network failures distinctly and calls onUnauthorized on 401", async () => {
    let unauthorized = 0;
    const offline = createApiClient({
      baseUrl: "/api",
      fetch: (async () => {
        throw new TypeError("offline");
      }) as unknown as typeof fetch,
    });
    expect(((await offline.cities().catch((e: unknown) => e)) as ApiError).code).toBe("NETWORK");
    const api = createApiClient({
      baseUrl: "/api",
      onUnauthorized: () => unauthorized++,
      fetch: fakeFetch(401, { code: "UNAUTHENTICATED", title: "Please sign in" }),
    });
    await api.me().catch(() => {});
    expect(unauthorized).toBe(1);
  });
});
