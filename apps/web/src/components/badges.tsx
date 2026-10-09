import { type Diet, formatLocalDate, formatShelfLife, type TempClass } from "@food-del/domain";
import type { DeliverySummary } from "@food-del/domain/contracts";
import { Snowflake, Sun, Truck } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "./ui/primitives";

/**
 * FSSAI veg / non-veg mark. Egg-containing food is legally non-vegetarian, so it carries the
 * brown mark with a "contains egg" label.
 */
export function DietMark({
  diet,
  withLabel = false,
  className,
}: {
  diet: Diet;
  withLabel?: boolean;
  className?: string;
}) {
  const veg = diet === "VEG";
  const color = veg ? "var(--color-veg)" : "var(--color-non-veg)";
  const label = diet === "VEG" ? "Vegetarian" : diet === "EGG" ? "Contains egg" : "Non-vegetarian";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft",
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="size-4 shrink-0" role="img" aria-label={label}>
        <rect
          x="1"
          y="1"
          width="14"
          height="14"
          rx="2"
          fill="#fff"
          stroke={color}
          strokeWidth="1.6"
        />
        <circle cx="8" cy="8" r="3.6" fill={color} />
      </svg>
      {withLabel && label}
    </span>
  );
}

export function FreshnessBadge({
  tempClass,
  shelfLifeHours,
}: {
  tempClass: TempClass;
  shelfLifeHours: number;
}) {
  const chilled = tempClass !== "AMBIENT";
  return (
    <Badge tone={chilled ? "chilled" : "ambient"}>
      {chilled ? (
        <Snowflake className="size-3.5" aria-hidden />
      ) : (
        <Sun className="size-3.5" aria-hidden />
      )}
      <span>
        {chilled ? "Chilled" : "Room temp"} · fresh {formatShelfLife(shelfLifeHours)}
      </span>
    </Badge>
  );
}

export function DeliveryPill({
  delivery,
  compact = false,
}: {
  delivery: DeliverySummary | null;
  compact?: boolean;
}) {
  if (!delivery) {
    return <span className="text-sm text-ink-muted">Set your pincode to see delivery dates</span>;
  }
  if (!delivery.available) {
    return <span className="text-sm font-medium text-warning">{delivery.message}</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-semibold text-success",
        compact && "text-xs",
      )}
    >
      <Truck className="size-4 shrink-0" aria-hidden />
      Arrives by {formatLocalDate(delivery.promisedDeliveryDate)}
    </span>
  );
}
