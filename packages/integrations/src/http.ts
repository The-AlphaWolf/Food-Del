/** Small fetch wrapper with timeouts and readable errors for third-party APIs. */

export class IntegrationError extends Error {
  constructor(
    readonly service: string,
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(`${service}: ${message}`);
    this.name = "IntegrationError";
  }
}

export interface JsonRequest {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export async function requestJson<T>(
  service: string,
  url: string,
  init: JsonRequest = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 15_000);
  try {
    const res = await fetchImpl(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        Accept: "application/json",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON error page; keep the raw text.
    }
    if (!res.ok) throw new IntegrationError(service, `HTTP ${res.status}`, res.status, parsed);
    return parsed as T;
  } catch (e) {
    if (e instanceof IntegrationError) throw e;
    const reason = e instanceof Error && e.name === "AbortError" ? "timed out" : String(e);
    throw new IntegrationError(service, reason);
  } finally {
    clearTimeout(timer);
  }
}
