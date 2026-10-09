/** The underlying Postgres error, unwrapped from Drizzle's "Failed query" wrapper. */
export interface PgError {
  code: string;
  constraint_name?: string;
  message: string;
}

export function pgError(e: unknown): PgError | null {
  let cur: unknown = e;
  for (let depth = 0; cur && depth < 5; depth++) {
    if (
      typeof cur === "object" &&
      "code" in cur &&
      typeof cur.code === "string" &&
      /^[0-9A-Z]{5}$/.test(cur.code)
    ) {
      return cur as PgError;
    }
    cur = typeof cur === "object" && "cause" in cur ? cur.cause : null;
  }
  return null;
}

export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  const pg = pgError(e);
  return pg?.code === "23505" && (!constraint || pg.constraint_name === constraint);
}

export function isCheckViolation(e: unknown, constraint?: string): boolean {
  const pg = pgError(e);
  return pg?.code === "23514" && (!constraint || pg.constraint_name === constraint);
}
