import { ApiError } from "@food-del/api-client";
import type { z } from "zod";

/** Field errors keyed by dotted path ("pickupAddress.contactPhone"). */
export type FieldErrors = Record<string, string>;

/** DOM id for a field path inside a form, so summaries can link and focus it. */
export const fieldId = (form: string, path: string) => `${form}-${path.replace(/\./g, "-")}`;

/**
 * Validation problems for the given fields, worded for people. `messages` replaces the schema's
 * generic text ("Too small: expected string…") with what to do, per field.
 */
export function issuesFor(
  error: z.ZodError | null,
  fields: readonly string[],
  messages: Record<string, string> = {},
): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error?.issues ?? []) {
    const path = issue.path.join(".");
    const field = fields.find((f) => path === f || path.startsWith(`${f}.`));
    if (!field || out[path]) continue;
    // A custom refinement already says what to do; generic type/size messages get ours.
    out[path] = issue.code === "custom" ? issue.message : (messages[path] ?? issue.message);
  }
  return out;
}

/** The summary list for an ErrorSummary, in the order the fields appear. */
export function summaryOf(
  errors: FieldErrors,
  form: string,
  order: readonly string[],
): { field: string; message: string }[] {
  const rank = (p: string) => {
    const i = order.findIndex((f) => p === f || p.startsWith(`${f}.`));
    return i === -1 ? order.length : i;
  };
  return Object.entries(errors)
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([path, message]) => ({ field: fieldId(form, path), message }));
}

/** Server problems that belong to a specific field, merged with field-level validation. */
export function serverErrors(
  e: unknown,
  codeToField: Record<string, string> = {},
): {
  fields: FieldErrors;
  message: string | null;
} {
  if (!(e instanceof ApiError)) {
    return { fields: {}, message: "Something went wrong. Please try again." };
  }
  const fields = { ...e.fieldErrors };
  const field = codeToField[e.code];
  if (field) fields[field] = e.message;
  return {
    fields,
    message: Object.keys(fields).length > 0 ? null : e.message,
  };
}

export const rupeesToPaise = (value: string): number => Math.round(Number(value) * 100);
export const paiseToRupees = (paise: number | null | undefined): string =>
  paise == null ? "" : String(paise / 100);

/** "" → undefined, so optional text fields stay optional. */
export const optional = (value: string): string | undefined => value.trim() || undefined;
