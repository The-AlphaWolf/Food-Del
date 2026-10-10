import type { Category, City, ItemCard } from "@food-del/domain/contracts";
import Link from "next/link";
import { ItemArt } from "@/components/item-art";
import { ItemGrid } from "@/components/item-card";
import { PincodePrompt } from "@/components/pincode-prompt";
import { EmptyState } from "@/components/ui/primitives";

export interface CityData {
  city: City;
  items: ItemCard[];
  categories: Category[];
}

export function CityView({ city, items, categories, pincode }: CityData & { pincode?: string }) {
  const kitchens = [...new Map(items.map((i) => [i.vendor.slug, i.vendor])).values()];
  const present = categories.filter((c) => items.some((i) => i.category.slug === c.slug));
  const oldest = kitchens.reduce<number | null>(
    (y, k) => (k.establishedYear && (!y || k.establishedYear < y) ? k.establishedYear : y),
    null,
  );
  // Featured first, then one per category, so the strip shows the city's range.
  const showcase = [
    ...items.filter((i) => i.isFeatured),
    ...present.map((c) => items.find((i) => i.category.slug === c.slug)!),
    ...items,
  ]
    .filter((i, n, all) => all.findIndex((x) => x.id === i.id) === n)
    .slice(0, 4);

  return (
    <>
      <section className="paper-grain border-b border-line">
        <div className="container-page grid items-center gap-8 py-10 md:grid-cols-[1.2fr_1fr] md:py-14">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-jaggery">
              Origin city
            </p>
            <h1 className="text-4xl font-extrabold md:text-5xl">Delicacies from {city.name}</h1>
            <p className="mt-3 max-w-2xl text-lg text-ink-soft">{city.tagline}.</p>
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
              {[
                [items.length, items.length === 1 ? "delicacy" : "delicacies"],
                [kitchens.length, kitchens.length === 1 ? "kitchen" : "kitchens"],
                ...(oldest ? [[oldest, "oldest kitchen opened"] as const] : []),
              ].map(([value, label]) => (
                <div key={label} className="flex flex-col-reverse">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    {label}
                  </dt>
                  <dd className="tabular font-display text-3xl font-extrabold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Kitchens">
              {kitchens.map((k) => (
                <li key={k.slug}>
                  <Link
                    href={`/kitchens/${k.slug}`}
                    className="inline-flex min-h-11 items-center rounded-pill border border-line-strong bg-card px-4 text-sm font-semibold transition-colors hover:border-jaggery hover:text-jaggery"
                  >
                    {k.name}
                    {k.establishedYear ? (
                      <span className="ml-1.5 font-normal text-ink-muted">
                        since {k.establishedYear}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {showcase.length > 0 && (
            // A taste of the city's table: a strip on phones, a staggered grid on wider screens.
            <div
              className="grid grid-cols-4 gap-2 md:mx-auto md:w-full md:max-w-md md:grid-cols-2 md:gap-3"
              aria-hidden
            >
              {showcase.map((i, n) => (
                <div
                  key={i.id}
                  className={`overflow-hidden rounded-lg border border-line shadow-card md:rounded-xl ${n % 2 ? "md:translate-y-6" : ""}`}
                >
                  <ItemArt art={i.artKey} tempClass={i.tempClass} className="aspect-square" />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      <div className="container-page py-10">
        <PincodePrompt initial={pincode ?? null} />
        {items.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            body="Our kitchens in this city are getting ready. Check back soon."
          />
        ) : (
          present.map((cat) => (
            <section key={cat.slug} className="mb-12" aria-labelledby={`cat-${cat.slug}`}>
              <h2
                id={`cat-${cat.slug}`}
                className="mb-4 flex items-baseline gap-3 text-2xl font-bold"
              >
                {cat.name}
                <span className="tabular font-sans text-sm font-semibold text-ink-muted">
                  {items.filter((i) => i.category.slug === cat.slug).length}
                </span>
              </h2>
              <ItemGrid items={items.filter((i) => i.category.slug === cat.slug)} context="city" />
            </section>
          ))
        )}
      </div>
    </>
  );
}
