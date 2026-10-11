import type { Category, City, ItemCard } from "@food-del/domain/contracts";
import { BadgeCheck, ShieldCheck, Snowflake } from "lucide-react";
import Link from "next/link";
import { TrendingInBengaluru, WeekendFeastBanner } from "@/components/bengaluru-social-proof";
import { HeroPincode } from "@/components/hero-pincode";
import { HometownHubs } from "@/components/hometown-hubs";
import { HowItWorks } from "@/components/how-it-works";
import { ItemArt } from "@/components/item-art";
import { ItemGrid } from "@/components/item-card";
import { ButtonLink, SectionHeading } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const _CITY_ART: Record<string, { art: string; temp: "AMBIENT" | "CHILLED" }> = {
  kolkata: { art: "sandesh", temp: "CHILLED" },
  hyderabad: { art: "biscuit", temp: "AMBIENT" },
  "delhi-ncr": { art: "halwa", temp: "AMBIENT" },
  bengaluru: { art: "pak", temp: "AMBIENT" },
};

export interface HomeData {
  cities: City[];
  featured: ItemCard[];
  categories: Category[];
}

/** The home page, rendered on the server or (GitHub Pages demo) in the browser. */
export function HomeView({
  cities,
  featured,
  categories,
  pincode,
}: HomeData & { pincode?: string }) {
  const _origins = cities.filter((c) => c.isOrigin && c.launchStatus === "LIVE");
  const destinations = cities
    .filter((c) => c.isDestination && c.launchStatus === "LIVE")
    .map((c) => c.name)
    .sort();

  return (
    <>
      <section className="paper-grain border-b border-line">
        <div className="container-page grid items-center gap-10 py-12 md:grid-cols-[1.2fr_0.9fr] md:py-16">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-jaggery/30 bg-jaggery/10 px-3.5 py-1 text-xs font-bold uppercase tracking-[0.14em] text-jaggery">
              <span>Bengaluru Tech Transplants · Taste of Home</span>
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.08] text-ink md:text-5xl lg:text-6xl">
              The taste of another city, delivered fresh to Bengaluru.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-soft">
              Iconic sweets and regional delicacies from the kitchens that made them famous in
              Kolkata, Hyderabad, Old Delhi & Mysuru — prepared fresh to order and flown cold-chain
              direct to your doorstep.
            </p>
            <div className="mt-7 max-w-lg">
              <HeroPincode initial={pincode ?? null} destinations={destinations} />
            </div>
          </div>

          {/* Staggered visual display */}
          <div
            className="relative mx-auto grid w-full grid-cols-2 gap-3 sm:max-w-md md:max-w-none md:gap-4"
            aria-hidden
          >
            {[
              {
                art: "sandesh",
                label: "Kolkata Nolen Gur Sandesh",
                badge: "Kolkata · Chilled Air Cargo",
              },
              {
                art: "biscuit",
                label: "Hyderabad Osmania Biscuits",
                badge: "Hyderabad · Freshly Baked",
              },
              { art: "halwa", label: "Old Delhi Sohan Halwa", badge: "Chandni Chowk · Pure Ghee" },
              { art: "pak", label: "Mysore Pak", badge: "Karnataka · Country Butter" },
            ].map((item, i) => (
              <div
                key={item.art}
                className={cn(
                  "group relative overflow-hidden rounded-xl border border-line bg-card shadow-card transition-transform duration-300 hover:-translate-y-1",
                  i % 2 ? "md:translate-y-6" : "",
                )}
              >
                <ItemArt
                  art={item.art}
                  tempClass={item.art === "sandesh" ? "CHILLED" : "AMBIENT"}
                  className="aspect-[4/3]"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 text-white">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-saffron">
                    {item.badge}
                  </p>
                  <p className="text-xs font-bold truncate text-white">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Hometown Hubs: The core emotional anchor for migrants */}
      <HometownHubs cities={cities} items={featured} />

      {/* Weekend Drop Banner */}
      <section className="container-page py-6">
        <WeekendFeastBanner />
      </section>

      {/* Featured Delicacies */}
      <section className="container-page py-12 md:py-14" aria-labelledby="featured">
        <SectionHeading
          id="featured"
          eyebrow={pincode ? `Delivering to ${pincode}` : "Most loved"}
          title="Delicacies people send home"
          action={
            <ButtonLink href="/search" variant="secondary" size="sm">
              See all
            </ButtonLink>
          }
        />
        <ItemGrid items={featured.slice(0, 8)} />
      </section>

      {/* Trending in Bengaluru Social Proof */}
      <TrendingInBengaluru />

      {/* Craving Categories */}
      <section className="container-page pb-12" aria-labelledby="cravings">
        <SectionHeading
          id="cravings"
          eyebrow="Or by craving"
          title="What are you in the mood for?"
        />
        <nav aria-label="Categories" className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/search?category=${c.slug}`}
              className="inline-flex min-h-11 items-center rounded-pill border border-line-strong bg-card px-5 text-sm font-semibold transition-colors hover:border-jaggery hover:text-jaggery"
            >
              {c.name}
            </Link>
          ))}
        </nav>
      </section>

      <section className="border-y border-line bg-paper-deep">
        <div className="container-page py-14">
          <SectionHeading
            eyebrow="Why it arrives fresh"
            title="Made to order. Timed to the hour."
          />
          <HowItWorks />
        </div>
      </section>

      <section className="container-page py-14">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: "Freshness promise",
              body: "We only offer a delivery date if at least 30% of the shelf life remains when it reaches you.",
            },
            {
              icon: Snowflake,
              title: "Real cold chain",
              body: "Chilled sweets fly in validated insulated boxes; we never send milk sweets by slow road.",
            },
            {
              icon: BadgeCheck,
              title: "Licensed kitchens",
              body: "Every kitchen is FSSAI-licensed and its licence number is on the product page.",
            },
          ].map((f) => (
            <div key={f.title} className="flex gap-4 rounded-lg border border-line bg-card p-5">
              <f.icon className="size-6 shrink-0 text-jaggery" aria-hidden />
              <div>
                <h3 className="font-sans text-base font-bold">{f.title}</h3>
                <p className="text-sm text-ink-soft">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
