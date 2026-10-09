/**
 * Error reporting to Sentry without the SDK: one HTTP envelope per error, sent from the server
 * only. The SDK's tracing and session features aren't needed for a handful of serverless
 * functions, and this keeps the bundle and the CSP unchanged.
 */

export interface ErrorReport {
  message: string;
  level: "error" | "warning";
  data?: Record<string, unknown>;
}

export interface ErrorReporter {
  capture(report: ErrorReport): Promise<void>;
}

export interface SentryDsn {
  key: string;
  host: string;
  projectId: string;
  protocol: string;
}

/** `https://<key>@o123.ingest.sentry.io/456` → its parts. Throws on a malformed DSN. */
export function parseSentryDsn(dsn: string): SentryDsn {
  const url = new URL(dsn);
  const projectId = url.pathname.replace(/^\/+|\/+$/g, "");
  if (!url.username || !projectId) throw new Error("Malformed SENTRY_DSN");
  return {
    key: url.username,
    host: url.host,
    projectId,
    protocol: url.protocol.replace(":", ""),
  };
}

/** Keys whose values never leave our servers, whatever the error. */
const REDACT = /phone|email|token|secret|password|authorization|cookie|address|otp|code/i;

export function redact(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (k === "stack") continue;
    out[k] = REDACT.test(k) ? "[redacted]" : v;
  }
  return out;
}

/** Turn a V8 stack string into Sentry frames (innermost last). */
function framesFrom(stack: unknown) {
  if (typeof stack !== "string") return undefined;
  const frames = stack
    .split("\n")
    .slice(1)
    .map((line) => {
      const m = /at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line.trim());
      return m
        ? { function: m[1] ?? "?", filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) }
        : null;
    })
    .filter((f) => f !== null)
    .reverse();
  return frames.length ? frames : undefined;
}

export class SentryReporter implements ErrorReporter {
  private readonly dsn: SentryDsn;

  constructor(
    dsn: string,
    private readonly opts: { environment: string; release?: string } = {
      environment: "production",
    },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.dsn = parseSentryDsn(dsn);
  }

  /** The envelope body for one report (exposed for tests). */
  envelope(report: ErrorReport, now = new Date()): string {
    const eventId = crypto.randomUUID().replaceAll("-", "");
    const error = typeof report.data?.error === "string" ? report.data.error : undefined;
    const event = {
      event_id: eventId,
      timestamp: now.getTime() / 1000,
      platform: "node",
      level: report.level,
      environment: this.opts.environment,
      release: this.opts.release,
      // Group by what failed, not by the varying details.
      fingerprint: [report.message],
      message: { formatted: report.message },
      exception: error
        ? {
            values: [
              {
                type: report.message,
                value: error,
                stacktrace: (() => {
                  const frames = framesFrom(report.data?.stack);
                  return frames ? { frames } : undefined;
                })(),
              },
            ],
          }
        : undefined,
      extra: redact(report.data),
    };
    return [
      JSON.stringify({ event_id: eventId, sent_at: now.toISOString() }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n");
  }

  async capture(report: ErrorReport): Promise<void> {
    const { protocol, host, projectId, key } = this.dsn;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    try {
      await this.fetchImpl(`${protocol}://${host}/api/${projectId}/envelope/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-sentry-envelope",
          "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${key}, sentry_client=food-del/1.0`,
        },
        body: this.envelope(report),
        signal: controller.signal,
      });
    } catch {
      // Reporting must never break the request that failed.
    } finally {
      clearTimeout(timer);
    }
  }
}
