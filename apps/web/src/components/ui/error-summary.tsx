"use client";

import { useEffect, useRef } from "react";

/**
 * Shown above a form after a failed submit. It takes focus so screen readers announce it, and
 * each problem links to its field; the inline errors stay in place.
 */
export function ErrorSummary({
  errors,
  title = "There's a problem",
}: {
  errors: { field: string; message: string }[];
  title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const key = errors.map((e) => `${e.field}:${e.message}`).join("|");
  // Refocus whenever the set of problems changes, not on every render.
  useEffect(() => {
    if (errors.length > 0) ref.current?.focus();
  }, [key]);
  if (errors.length === 0) return null;
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      aria-labelledby="error-summary-title"
      className="rounded-lg border-2 border-danger bg-danger-soft p-4 focus-visible:outline-offset-4"
    >
      <h2 id="error-summary-title" className="font-sans text-base font-bold text-danger">
        {title}
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {errors.map((e) => (
          <li key={`${e.field}-${e.message}`}>
            <a
              href={`#${e.field}`}
              className="font-medium text-danger underline underline-offset-2"
              onClick={(ev) => {
                ev.preventDefault();
                document.getElementById(e.field)?.focus();
              }}
            >
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
