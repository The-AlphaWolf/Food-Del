import type { ItemCard as ItemCardData } from "@food-del/domain/contracts";
import Link from "next/link";
import { formatINR } from "@/lib/format";
import { DeliveryPill, DietMark, FreshnessBadge } from "./badges";
import { ItemArt } from "./item-art";

/**
 * A delicacy in a list. Phones get a compact row (thumbnail beside the details) so a city's
 * catalogue scans quickly; wider screens get the full card.
 */
/**
 * Where the card is shown changes what's worth saying: on a city's page every card is from that
 * city, so the eyebrow names the kitchen; on a kitchen's page, the kind of delicacy.
 */
export type CardContext = "browse" | "city" | "kitchen";

export function ItemCard({
  item,
  priority = false,
  context = "browse",
}: {
  item: ItemCardData;
  priority?: boolean;
  context?: CardContext;
}) {
  const eyebrow =
    context === "city"
      ? item.vendor.name
      : context === "kitchen"
        ? item.category.name
        : `From ${item.vendor.city.name}`;
  return (
    <article className="group relative flex h-full overflow-hidden rounded-lg border border-line bg-card transition-shadow duration-200 hover:shadow-card focus-within:shadow-card sm:flex-col">
      <div
        className="w-28 shrink-0 self-stretch overflow-hidden border-r border-line sm:aspect-[4/3] sm:w-auto sm:border-r-0"
        data-priority={priority || undefined}
      >
        <ItemArt
          art={item.artKey}
          tempClass={item.tempClass}
          className="transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:gap-2 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-jaggery sm:text-xs">
            {eyebrow}
          </p>
          <DietMark diet={item.diet} />
        </div>
        <h3 className="text-base font-bold leading-snug sm:text-lg">
          <Link
            href={`/delicacy/${item.slug}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {item.name}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm text-ink-soft">{item.shortDescription}</p>
        {context === "browse" && (
          <p className="hidden text-xs text-ink-muted sm:block">{item.vendor.name}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:mt-auto sm:pt-2">
          <FreshnessBadge tempClass={item.tempClass} shelfLifeHours={item.shelfLifeHours} />
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-1 sm:mt-0 sm:border-t sm:border-line sm:pt-3">
          <DeliveryPill delivery={item.delivery} compact />
          <p className="tabular ml-auto text-right">
            <span className="block text-[11px] font-semibold uppercase text-ink-muted">from</span>
            <span className="text-base font-bold sm:text-lg">{formatINR(item.fromPricePaise)}</span>
          </p>
        </div>
      </div>
    </article>
  );
}

export function ItemGrid({ items, context }: { items: ItemCardData[]; context?: CardContext }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item, i) => (
        <li key={item.id}>
          <ItemCard item={item} priority={i < 4} context={context} />
        </li>
      ))}
    </ul>
  );
}
