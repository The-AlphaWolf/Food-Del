import { ArrowRight, BadgeCheck, ShieldCheck, Snowflake } from "lucide-react";
import Link from "next/link";
import { HeroPincode } from "@/components/hero-pincode";
import { HowItWorks } from "@/components/how-it-works";
import { ItemArt } from "@/components/item-art";
import { ItemGrid } from "@/components/item-card";
import { ButtonLink, SectionHeading } from "@/components/ui/primitives";
import { currentPincode, getCore } from "@/server/data";

// Delivery dates depend on the shopper's pincode and live stock.
export const dynamic = "force-dynamic";

const CITY_ART: Record<string, { art: string; temp: "AMBIENT" | "CHILLED" }> = {
  kolkata: { art: "sandesh", temp: "CHILLED" },
  hyderabad: { art: "biscuit", temp: "AMBIENT" },
  "delhi-ncr": { art: "halwa", temp: "AMBIENT" },
  bengaluru: { art: "pak", temp: "AMBIENT" },
};

export default async function HomePage() {
  const core = getCore();
  const pincode = await currentPincode();
  const [cities, featured, categories] = await Promise.all([
    core.catalog.listCities(),
    core.catalog.listItems({ featured: "true", pincode, limit: 8 }),
    core.catalog.listCategories(),
  ]);
  const origins = cities.filter((c) => c.isOrigin && c.launchStatus === "LIVE");

  return (
    <>
      <section className="paper-grain border-b border-line">
        <div className="container-page grid items-center gap-10 py-12 md:grid-cols-[1.1fr_1fr] md:py-20">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-jaggery">
              Kolkata · Hyderabad · Old Delhi · Mysuru
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.08] text-ink md:text-6xl">
              The taste of another city, delivered fresh.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-soft">
              Iconic sweets and specialities from the kitchens that made them famous — prepared for
              your order and shipped cold-chain to arrive on the day you choose.
            </p>
            <div className="mt-8 max-w-md">
              <HeroPincode initial={pincode ?? null} />
            </div>
          </div>
          <div className="relative mx-auto grid w-full max-w-md grid-cols-2 gap-3" aria-hidden>
            {["sandesh", "laddoo", "biscuit", "barfi"].map((art, i) => (
              <div
                key={art}
                className={`overflow-hidden rounded-xl border border-line shadow-card ${i % 2 ? "translate-y-6" : ""}`}
              >
                <ItemArt
                  art={art}
                  tempClass={art === "sandesh" ? "CHILLED" : "AMBIENT"}
                  className="aspect-square"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-14" aria-labelledby="origins">
        <SectionHeading eyebrow="Shop by city" title="Where would you like to taste today?" />
        <h2 id="origins" className="sr-only">
          Origin cities
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {origins.map((c) => {
            const look = CITY_ART[c.slug] ?? { art: "laddoo", temp: "AMBIENT" as const };
            return (
              <li key={c.id}>
                <Link
                  href={`/from/${c.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-card transition-shadow hover:shadow-card"
                >
                  <div className="aspect-[16/9] overflow-hidden">
                    <ItemArt
                      art={look.art}
                      tempClass={look.temp}
                      className="transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-4">
                    <h3 className="text-xl font-bold">{c.name}</h3>
                    <p className="text-sm text-ink-soft">{c.tagline}</p>
                    <p className="mt-auto flex items-center gap-1 pt-2 text-sm font-semibold text-jaggery">
                      {c.itemCount} delicacies{" "}
                      <ArrowRight
                        className="size-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="container-page pb-14">
        <SectionHeading
          eyebrow={pincode ? `Delivering to ${pincode}` : "Most loved"}
          title="Delicacies people send home"
          action={
            <ButtonLink href="/search" variant="secondary" size="sm">
              See all
            </ButtonLink>
          }
        />
        <ItemGrid items={featured} />
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
        <nav aria-label="Categories" className="mt-10 flex flex-wrap gap-2">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/search?category=${c.slug}`}
              className="rounded-pill border border-line-strong bg-card px-4 py-2 text-sm font-semibold hover:border-jaggery hover:text-jaggery"
            >
              {c.name}
            </Link>
          ))}
        </nav>
      </section>
    </>
  );
}
