import type { ItemCard as ItemCardData } from "@food-del/domain/contracts";
import Link from "next/link";
import { formatINR } from "@/lib/format";
import { DeliveryPill, DietMark, FreshnessBadge } from "./badges";
import { ItemArt } from "./item-art";

export function ItemCard({ item, priority = false }: { item: ItemCardData; priority?: boolean }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-card transition-shadow duration-200 hover:shadow-card focus-within:shadow-card">
      <div className="aspect-[4/3] overflow-hidden" data-priority={priority || undefined}>
        <ItemArt
          art={item.artKey}
          tempClass={item.tempClass}
          className="transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-jaggery">
            From {item.vendor.city.name}
          </p>
          <DietMark diet={item.diet} />
        </div>
        <h3 className="text-lg font-bold leading-snug">
          <Link
            href={`/delicacy/${item.slug}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {item.name}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm text-ink-soft">{item.shortDescription}</p>
        <p className="text-xs text-ink-muted">{item.vendor.name}</p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <FreshnessBadge tempClass={item.tempClass} shelfLifeHours={item.shelfLifeHours} />
        </div>
        <div className="flex items-end justify-between gap-2 border-t border-line pt-3">
          <DeliveryPill delivery={item.delivery} compact />
          <p className="tabular text-right">
            <span className="block text-[11px] font-semibold uppercase text-ink-muted">from</span>
            <span className="text-lg font-bold">{formatINR(item.fromPricePaise)}</span>
          </p>
        </div>
      </div>
    </article>
  );
}

export function ItemGrid({ items }: { items: ItemCardData[] }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item, i) => (
        <li key={item.id}>
          <ItemCard item={item} priority={i < 4} />
        </li>
      ))}
    </ul>
  );
}
