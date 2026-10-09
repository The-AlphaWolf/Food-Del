"use client";

import { WEEKDAY_SHORT } from "@food-del/domain";
import type { KitchenDetail } from "@food-del/domain/contracts";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Badge } from "../ui/primitives";

export function useOnboardingOptions() {
  return useQuery({
    queryKey: ["ops-onboarding-options"],
    queryFn: api.onboardingOptions,
    staleTime: 60_000,
  });
}

const KITCHEN_TONES = {
  ONBOARDING: { tone: "saffron", label: "Onboarding" },
  ACTIVE: { tone: "success", label: "Live" },
  PAUSED: { tone: "warning", label: "Paused" },
  OFFBOARDED: { tone: "neutral", label: "Offboarded" },
} as const;

export function KitchenStatusBadge({ status }: { status: KitchenDetail["status"] }) {
  const s = KITCHEN_TONES[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const ITEM_TONES = {
  DRAFT: { tone: "neutral", label: "Draft" },
  ACTIVE: { tone: "success", label: "On sale" },
  PAUSED: { tone: "warning", label: "Paused" },
  ARCHIVED: { tone: "neutral", label: "Archived" },
} as const;

export function ItemStatusBadge({ status }: { status: keyof typeof ITEM_TONES }) {
  const s = ITEM_TONES[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Seven day toggles over an ISO weekday bitmask (bit 0 = Monday). */
export function WeekdayPicker({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id: string;
  value: number;
  onChange: (mask: number) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div
      id={id}
      role="group"
      tabIndex={-1}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className="flex flex-wrap gap-2"
    >
      {WEEKDAY_SHORT.map((day, i) => {
        const on = (value & (1 << i)) !== 0;
        return (
          <button
            key={day}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(value ^ (1 << i))}
            className={cn(
              "flex min-h-11 min-w-14 items-center justify-center gap-1 rounded-md border px-3 text-sm font-semibold transition-colors duration-150",
              on
                ? "border-jaggery bg-jaggery text-on-jaggery"
                : "border-line-strong bg-card text-ink-soft hover:border-jaggery",
            )}
          >
            {on && <Check className="size-3.5" aria-hidden />}
            {day}
          </button>
        );
      })}
    </div>
  );
}

/** "Step 2 of 4" with the steps named, so long forms show where you are and what's left. */
export function Stepper({
  steps,
  current,
  onSelect,
}: {
  steps: readonly string[];
  current: number;
  /** Only completed steps can be revisited. */
  onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="Progress" className="mb-6">
      <p className="mb-3 text-sm font-semibold text-ink-muted">
        Step {current + 1} of {steps.length}
        {/* Phones show only the bars, so name the current step here. */}
        <span className="text-ink sm:hidden"> · {steps[current]}</span>
      </p>
      <ol className="grid grid-cols-4 gap-2">
        {steps.map((label, i) => {
          const done = i < current;
          const here = i === current;
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!done}
                aria-current={here ? "step" : undefined}
                onClick={() => onSelect(i)}
                className={cn(
                  "flex w-full items-center gap-2 border-t-4 pt-2 text-left text-sm font-semibold transition-colors disabled:cursor-default",
                  here
                    ? "border-jaggery text-ink"
                    : done
                      ? "border-success text-ink-soft hover:text-ink"
                      : "border-line text-ink-muted",
                )}
              >
                <span
                  className={cn(
                    "tabular flex size-6 shrink-0 items-center justify-center rounded-full text-xs",
                    here
                      ? "bg-jaggery text-on-jaggery"
                      : done
                        ? "bg-success text-white"
                        : "bg-paper-deep text-ink-muted",
                  )}
                >
                  {done ? <Check className="size-3.5" aria-label="done" /> : i + 1}
                </span>
                <span className="sr-only sm:not-sr-only">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** A titled group of fields inside a long form. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="grid gap-4 rounded-lg border border-line bg-card p-4 md:p-6">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <p className="font-display text-xl font-bold">{title}</p>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}
