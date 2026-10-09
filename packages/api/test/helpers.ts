import { createTestCore, type TestCore } from "@food-del/core/testing";
import { createApi } from "../src/app";
import type { ApiConfig } from "../src/env";

export const DEV_SECRET = "test-secret-at-least-32-characters-long!!";

export async function createTestApi(now: Date, overrides: Partial<ApiConfig> = {}) {
  const t: TestCore = await createTestCore({ now });
  const api = createApi(t.core, {
    auth: { mode: "dev", devSecret: DEV_SECRET },
    devTools: true,
    cronSecret: "cron-secret",
    secureCookies: false,
    ...overrides,
  });
  /** JSON request helper returning status, headers and parsed body. */
  async function call<T = unknown>(
    method: string,
    path: string,
    opts: { body?: unknown; token?: string; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; body: T; headers: Headers }> {
    const res = await api.request(`/api${path}`, {
      method,
      headers: {
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...opts.headers,
      },
      body:
        opts.body === undefined
          ? undefined
          : typeof opts.body === "string"
            ? opts.body
            : JSON.stringify(opts.body),
    });
    const text = await res.text();
    return {
      status: res.status,
      body: (text ? JSON.parse(text) : null) as T,
      headers: res.headers,
    };
  }
  async function login(phone: string): Promise<string> {
    await call("POST", "/v1/auth/otp", { body: { phone } });
    const r = await call<{ token: string }>("POST", "/v1/auth/verify", {
      body: { phone, code: "123456" },
    });
    if (r.status !== 200) throw new Error(`login failed: ${JSON.stringify(r.body)}`);
    return r.body.token;
  }
  return { t, api, call, login };
}
