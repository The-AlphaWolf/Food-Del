import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityDemo } from "@/components/demo/pages";
import { CityView } from "@/components/pages/city-view";
import { STATIC_DEMO } from "@/lib/demo";
import { demoParams } from "@/lib/demo-params";
import { currentPincode, getCore } from "@/server/data";

// Live stock and dates per request. (The GitHub Pages build switches this to "force-static";
// see scripts/build-pages.mjs.)
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ city: string }> };

/** The GitHub Pages export pre-builds the seeded cities; the server renders any city on demand. */
export async function generateStaticParams() {
  return STATIC_DEMO ? demoParams.cities() : [];
}

async function cityFor(slug: string) {
  const cities = await getCore().catalog.listCities();
  return cities.find((c) => c.slug === slug && c.isOrigin) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (STATIC_DEMO) return demoParams.cityMetadata((await params).city);
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
  if (STATIC_DEMO) return <CityDemo slug={slug} />;
  const city = await cityFor(slug);
  if (!city) notFound();
  const pincode = await currentPincode();
  const [items, categories] = await Promise.all([
    getCore().catalog.listItems({ origin: slug, pincode, limit: 100 }),
    getCore().catalog.listCategories(),
  ]);
  return <CityView city={city} items={items} categories={categories} pincode={pincode} />;
}
