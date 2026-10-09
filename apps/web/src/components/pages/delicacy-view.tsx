import { formatShelfLife, TEMP_LABELS } from "@food-del/domain";
import type { ItemCard, ItemDetail } from "@food-del/domain/contracts";
import Link from "next/link";
import { AddToCart } from "@/components/add-to-cart";
import { DietMark, FreshnessBadge } from "@/components/badges";
import { ItemArt } from "@/components/item-art";
import { ItemGrid } from "@/components/item-card";
import { SectionHeading } from "@/components/ui/primitives";
import { formatINR } from "@/lib/format";

export function DelicacyView({
  item,
  more,
  pincode,
}: {
  item: ItemDetail;
  more: ItemCard[];
  pincode?: string;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: item.name,
    description: item.description ?? item.shortDescription,
    brand: { "@type": "Brand", name: item.vendor.name },
    countryOfOrigin: "IN",
    offers: item.variants.map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      name: v.label,
      price: (v.pricePaise / 100).toFixed(2),
      priceCurrency: "INR",
      availability: "https://schema.org/PreOrder",
    })),
  };

  return (
    <div className="container-page py-8 md:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-jaggery">
              Home
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href={`/from/${item.vendor.city.slug}`} className="hover:text-jaggery">
              {item.vendor.city.name}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="font-semibold text-ink">
            {item.name}
          </li>
        </ol>
      </nav>

      {/* Phones read art → buy box → details; wide screens pin the buy box beside both. */}
      <div className="grid gap-8 lg:grid-cols-[1fr_28rem] lg:gap-x-10">
        <div className="overflow-hidden rounded-xl border border-line lg:col-start-1 lg:row-start-1">
          <ItemArt
            art={item.artKey}
            tempClass={item.tempClass}
            label={`Illustration of ${item.name}`}
            className="aspect-[4/3]"
          />
        </div>

        <aside className="lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <div className="rounded-xl border border-line bg-card p-5 shadow-card md:p-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Link
                href={`/from/${item.vendor.city.slug}`}
                className="text-xs font-bold uppercase tracking-[0.14em] text-jaggery hover:underline"
              >
                From {item.vendor.city.name}
              </Link>
              <DietMark diet={item.diet} withLabel />
            </div>
            <h1 className="text-3xl font-extrabold leading-tight md:text-4xl">{item.name}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              by{" "}
              <Link
                href={`/kitchens/${item.vendor.slug}`}
                className="font-semibold text-ink-soft hover:text-jaggery"
              >
                {item.vendor.name}
              </Link>
            </p>
            <p className="mt-3 text-ink-soft">{item.shortDescription}</p>
            <div className="mt-3">
              <FreshnessBadge tempClass={item.tempClass} shelfLifeHours={item.shelfLifeHours} />
            </div>
            <div className="mt-6">
              <AddToCart item={item} initialPincode={pincode ?? null} />
            </div>
          </div>
        </aside>

        <div className="flex flex-col gap-8 lg:col-start-1 lg:row-start-2">
          {item.description && (
            <section>
              <h2 className="mb-2 text-2xl font-bold">About this delicacy</h2>
              <p className="text-ink-soft">{item.description}</p>
              {item.originStory && (
                <p className="mt-3 border-l-2 border-saffron pl-4 italic text-ink-soft">
                  {item.originStory}
                </p>
              )}
            </section>
          )}
          {item.vendorStory && (
            <section className="rounded-lg border border-line bg-card p-5">
              <h2 className="mb-1 text-xl font-bold">
                <Link href={`/kitchens/${item.vendor.slug}`} className="hover:text-jaggery">
                  {item.vendor.name}
                </Link>
              </h2>
              <p className="mb-2 text-sm font-semibold text-jaggery">
                {item.vendor.city.name}
                {item.vendor.establishedYear ? ` · since ${item.vendor.establishedYear}` : ""}
              </p>
              <p className="text-sm text-ink-soft">{item.vendorStory}</p>
            </section>
          )}
          <section aria-labelledby="declarations" className="rounded-lg border border-line bg-card">
            <h2
              id="declarations"
              className="border-b border-line px-5 py-3 font-sans text-base font-bold"
            >
              Product information
            </h2>
            <dl className="grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="font-semibold text-ink-muted">Ingredients</dt>
              <dd>{item.legal.ingredients}</dd>
              <dt className="font-semibold text-ink-muted">Allergens</dt>
              <dd>
                {item.legal.allergens.length ? item.legal.allergens.join(", ") : "None declared"}
              </dd>
              <dt className="font-semibold text-ink-muted">Diet</dt>
              <dd>
                <DietMark diet={item.diet} withLabel />
              </dd>
              <dt className="font-semibold text-ink-muted">Shelf life</dt>
              <dd>
                {formatShelfLife(item.freshness.shelfLifeHours)} from preparation,{" "}
                {TEMP_LABELS[item.freshness.tempClass].toLowerCase()}.{" "}
                {item.freshness.madeToOrder
                  ? "Made to order for your dispatch day."
                  : "Packed from a fresh batch."}{" "}
                We guarantee at least {formatShelfLife(item.freshness.minResidualHours)} left on
                arrival.
              </dd>
              <dt className="font-semibold text-ink-muted">Storage</dt>
              <dd>{item.legal.storage}</dd>
              <dt className="font-semibold text-ink-muted">Manufacturer</dt>
              <dd>{item.legal.manufacturer}</dd>
              <dt className="font-semibold text-ink-muted">FSSAI licence</dt>
              <dd className="tabular">{item.legal.fssaiLicenseNo}</dd>
              <dt className="font-semibold text-ink-muted">Country of origin</dt>
              <dd>{item.legal.countryOfOrigin}</dd>
              <dt className="font-semibold text-ink-muted">Price</dt>
              <dd>
                Inclusive of {item.gstRateBps / 100}% GST. From {formatINR(item.fromPricePaise)}.
              </dd>
            </dl>
          </section>
        </div>
      </div>

      {more.length > 0 && (
        <section className="mt-16">
          <SectionHeading eyebrow={`More from ${item.vendor.name}`} title="From the same kitchen" />
          <ItemGrid items={more} />
        </section>
      )}
    </div>
  );
}
