import { DomainError } from "@food-del/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SendDemo } from "@/components/demo/pages";
import { CITY_PINCODE, SendView } from "@/components/pages/send-view";
import { STATIC_DEMO } from "@/lib/demo";
import { demoParams } from "@/lib/demo-params";
import { getCore } from "@/server/data";

// Live stock and dates per request. (The GitHub Pages build switches this to "force-static";
// see scripts/build-pages.mjs.)
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; city: string }> };

export async function generateStaticParams() {
  return STATIC_DEMO ? demoParams.sends() : [];
}

async function load(slug: string, citySlug: string) {
  const core = getCore();
  const cities = await core.catalog.listCities();
  const dest = cities.find((c) => c.slug === citySlug && c.isDestination);
  const pincode = CITY_PINCODE[citySlug];
  if (!dest || !pincode) notFound();
  try {
    const item = await core.catalog.getItem(slug, pincode);
    return { item, dest };
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, city } = await params;
  if (STATIC_DEMO) return demoParams.sendMetadata(slug, city);
  const { item, dest } = await load(slug, city);
  const title = `Send ${item.name} from ${item.vendor.city.name} to ${dest.name}`;
  return {
    title,
    description: `Order authentic ${item.name} from ${item.vendor.name}, ${item.vendor.city.name}. Made to order and delivered fresh to ${dest.name}.`,
    alternates: { canonical: `/send/${item.slug}/to/${dest.slug}` },
  };
}

export default async function SendPage({ params }: Props) {
  const { slug, city } = await params;
  if (STATIC_DEMO) return <SendDemo slug={slug} city={city} />;
  const { item, dest } = await load(slug, city);
  return <SendView item={item} dest={dest} />;
}
