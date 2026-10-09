/**
 * Errors the API turns into problem+json responses. `code` is stable and documented; clients
 * branch on it, never on the message.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (what: string) => new DomainError("NOT_FOUND", `${what} not found.`, 404);

export const unauthenticated = () =>
  new DomainError("UNAUTHENTICATED", "Please sign in to continue.", 401);

export const forbidden = (message = "You don't have access to this.") =>
  new DomainError("FORBIDDEN", message, 403);

export const conflict = (code: string, message: string, details?: unknown) =>
  new DomainError(code, message, 409, details);

export const invalid = (code: string, message: string, details?: unknown) =>
  new DomainError(code, message, 422, details);
