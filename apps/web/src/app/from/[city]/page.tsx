import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemGrid } from "@/components/item-card";
import { EmptyState } from "@/components/ui/primitives";
import { currentPincode, getCore } from "@/server/data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ city: string }> };

async function cityFor(slug: string) {
  const cities = await getCore().catalog.listCities();
  return cities.find((c) => c.slug === slug && c.isOrigin) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const city = await cityFor((await params).city);
  if (!city) return {};
  return {
    title: `Delicacies from ${city.name}`,
    description: `${city.tagline}. Order ${city.name}'s iconic sweets and specialities, made to order and delivered fresh across India.`,
    alternates: { canonical: `/from/${city.slug}` },
  };
}

export default async function CityPage({ params }: Props) {
  const { city: slug } = await params;
  const city = await cityFor(slug);
  if (!city) notFound();
  const pincode = await currentPincode();
  const [items, categories] = await Promise.all([
    getCore().catalog.listItems({ origin: slug, pincode, limit: 100 }),
    getCore().catalog.listCategories(),
  ]);
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
