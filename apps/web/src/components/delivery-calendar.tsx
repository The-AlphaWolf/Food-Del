"use client";

import { isoWeekday } from "@food-del/domain";
import type { CalendarDay } from "@food-del/domain/contracts";
import { cn } from "@/lib/cn";
import { formatLocalDate } from "@/lib/format";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Delivery-date picker. Every day is focusable: available days can be chosen, unavailable ones
 * explain why (sold out, cutoff passed, wouldn't stay fresh…) instead of silently greying out.
 */
export function DeliveryCalendar({
  days,
  selected,
  onSelect,
  onInspect,
}: {
  days: CalendarDay[];
  selected: string | null;
  onSelect: (date: string) => void;
  onInspect?: (day: CalendarDay | null) => void;
}) {
  if (days.length === 0) return null;
  const leading = isoWeekday(days[0]!.date) - 1;
  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wider text-ink-muted">
        {WEEKDAYS.map((d) => (
          <span key={d} aria-hidden>
            {d}
          </span>
        ))}
      </div>
      <div role="radiogroup" aria-label="Delivery date" className="grid grid-cols-7 gap-1">
        {Array.from({ length: leading }, (_, i) => (
          <span key={`pad-${i}`} aria-hidden />
        ))}
        {days.map((d) => {
          const available = Boolean(d.plan);
          const isSelected = selected === d.date;
          const dayNum = Number(d.date.slice(8, 10));
          const label = `${formatLocalDate(d.date)}: ${available ? "available" : (d.message ?? "unavailable")}`;
          return (
            <button
              key={d.date}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={!available}
              aria-label={label}
              title={available ? undefined : (d.message ?? undefined)}
              onClick={() => (available ? onSelect(d.date) : onInspect?.(d))}
              onFocus={() => onInspect?.(d)}
              onMouseEnter={() => onInspect?.(d)}
              onMouseLeave={() => onInspect?.(null)}
              className={cn(
                "tabular flex aspect-square min-h-11 flex-col items-center justify-center rounded-md border text-sm font-bold transition-colors duration-150",
                available &&
                  !isSelected &&
                  "border-line-strong bg-card text-ink hover:border-jaggery hover:text-jaggery",
                isSelected && "border-jaggery bg-jaggery text-white",
                !available &&
                  "cursor-not-allowed border-transparent bg-paper-deep/70 text-ink-muted/70 line-through decoration-1",
              )}
            >
              {dayNum}
              {available && !isSelected && d.plan?.coldChain && (
                <span className="mt-0.5 size-1 rounded-pill bg-chilled" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
