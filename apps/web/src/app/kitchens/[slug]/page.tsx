import { DomainError } from "@food-del/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KitchenDemo } from "@/components/demo/pages";
import { KitchenView } from "@/components/pages/kitchen-view";
import { STATIC_DEMO } from "@/lib/demo";
import { demoParams } from "@/lib/demo-params";
import { currentPincode, getCore } from "@/server/data";

// Live stock and dates per request. (The GitHub Pages build switches this to "force-static";
// see scripts/build-pages.mjs.)
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return STATIC_DEMO ? demoParams.kitchens() : [];
}

async function load(slug: string, pincode?: string) {
  try {
    return await getCore().catalog.getVendor(slug, pincode);
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (STATIC_DEMO) return demoParams.kitchenMetadata((await params).slug);
  const v = await load((await params).slug);
  return { title: `${v.name}, ${v.city.name}`, description: v.tagline ?? undefined };
}

export default async function KitchenPage({ params }: Props) {
  const { slug } = await params;
  if (STATIC_DEMO) return <KitchenDemo slug={slug} />;
  const pincode = await currentPincode();
  return <KitchenView v={await load(slug, pincode)} pincode={pincode} />;
}
