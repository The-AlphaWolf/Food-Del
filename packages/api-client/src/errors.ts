import type { Problem } from "@food-del/domain/contracts";

/** An API error with the server's stable problem code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static fromProblem(status: number, p: Partial<Problem> | null): ApiError {
    return new ApiError(
      status,
      p?.code ?? (status === 0 ? "NETWORK" : "UNKNOWN"),
      p?.title ??
        (status === 0 ? "Can't reach the server. Check your connection." : "Something went wrong."),
      p?.details,
    );
  }

  /** Field-level validation messages, keyed by dotted path. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== "VALIDATION_FAILED" || !Array.isArray(this.details)) return {};
    return Object.fromEntries(
      (this.details as { path: string; message: string }[]).map((d) => [d.path, d.message]),
    );
  }
}
