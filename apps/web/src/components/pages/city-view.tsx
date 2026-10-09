import type { Category, City, ItemCard } from "@food-del/domain/contracts";
import Link from "next/link";
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

  return (
    <>
      <section className="paper-grain border-b border-line">
        <div className="container-page py-12">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-jaggery">
            Origin city
          </p>
          <h1 className="text-4xl font-extrabold md:text-5xl">Delicacies from {city.name}</h1>
          <p className="mt-3 max-w-2xl text-lg text-ink-soft">{city.tagline}.</p>
          <ul className="mt-6 flex flex-wrap gap-2" aria-label="Kitchens">
            {kitchens.map((k) => (
              <li key={k.slug}>
                <Link
                  href={`/kitchens/${k.slug}`}
                  className="inline-flex rounded-pill border border-line-strong bg-card px-4 py-2 text-sm font-semibold hover:border-jaggery hover:text-jaggery"
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
              <h2 id={`cat-${cat.slug}`} className="mb-4 text-2xl font-bold">
                {cat.name}
              </h2>
              <ItemGrid items={items.filter((i) => i.category.slug === cat.slug)} />
            </section>
          ))
        )}
      </div>
    </>
  );
}
