import { DomainError } from "@food-del/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DelicacyDemo } from "@/components/demo/pages";
import { DelicacyView } from "@/components/pages/delicacy-view";
import { STATIC_DEMO } from "@/lib/demo";
import { demoParams } from "@/lib/demo-params";
import { currentPincode, getCore } from "@/server/data";

// Live stock and dates per request. (The GitHub Pages build switches this to "force-static";
// see scripts/build-pages.mjs.)
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return STATIC_DEMO ? demoParams.delicacies() : [];
}

async function load(slug: string, pincode?: string) {
  try {
    return await getCore().catalog.getItem(slug, pincode);
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (STATIC_DEMO) return demoParams.delicacyMetadata(slug);
  const item = await load(slug);
  const title = `${item.name} from ${item.vendor.city.name}`;
  return {
    title,
    description: `${item.shortDescription} Made to order by ${item.vendor.name} and delivered fresh across India.`,
    alternates: { canonical: `/delicacy/${item.slug}` },
    openGraph: { title, description: item.shortDescription },
  };
}

export default async function ItemPage({ params }: Props) {
  const { slug } = await params;
  if (STATIC_DEMO) return <DelicacyDemo slug={slug} />;
  const pincode = await currentPincode();
  const item = await load(slug, pincode);
  const more = (await getCore().catalog.listItems({ vendor: item.vendor.slug, pincode, limit: 5 }))
    .filter((i) => i.id !== item.id)
    .slice(0, 4);
  return <DelicacyView item={item} more={more} pincode={pincode} />;
}
