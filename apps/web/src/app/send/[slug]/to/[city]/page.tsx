import { DomainError } from "@food-del/core";
import { formatShelfLife } from "@food-del/domain";
import { CalendarCheck, Snowflake, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemArt } from "@/components/item-art";
import { ButtonLink } from "@/components/ui/primitives";
import { formatINR, formatLocalDate } from "@/lib/format";
import { getCore } from "@/server/data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; city: string }> };

/** A representative pincode per destination city for the landing-page estimate. */
const CITY_PINCODE: Record<string, string> = {
  bengaluru: "560001",
  mumbai: "400001",
  "delhi-ncr": "110001",
  hyderabad: "500001",
  chennai: "600001",
  kolkata: "700001",
  pune: "411001",
};

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
  const { item, dest } = await load(slug, city);
  const d = item.delivery;
  return (
    <div className="container-page grid gap-10 py-12 md:grid-cols-2">
      <div className="overflow-hidden rounded-xl border border-line">
        <ItemArt
          art={item.artKey}
          tempClass={item.tempClass}
          label={item.name}
          className="aspect-[4/3]"
        />
      </div>
      <div className="flex flex-col gap-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-jaggery">
          {item.vendor.city.name} → {dest.name}
        </p>
        <h1 className="text-4xl font-extrabold leading-tight">
          Send {item.name} from {item.vendor.city.name} to {dest.name}
        </h1>
        <p className="text-lg text-ink-soft">{item.shortDescription}</p>
        <ul className="space-y-3 rounded-lg border border-line bg-card p-5 text-sm">
          {d?.available ? (
            <>
              <li className="flex gap-2">
                <CalendarCheck className="size-5 text-jaggery" aria-hidden />
                Earliest delivery in {dest.name}:{" "}
                <strong>{formatLocalDate(d.promisedDeliveryDate)}</strong>
              </li>
              <li className="flex gap-2">
                <Truck className="size-5 text-jaggery" aria-hidden />
                Delivery from {formatINR(d.deliveryFeePaise)} per parcel, packaging included
              </li>
            </>
          ) : (
            <li className="font-semibold text-warning">
              {d?.message ?? "Not deliverable right now."}
            </li>
          )}
          <li className="flex gap-2">
            <Snowflake className="size-5 text-chilled" aria-hidden />
            Stays fresh {formatShelfLife(item.shelfLifeHours)}; we guarantee at least{" "}
            {formatShelfLife(item.freshness.minResidualHours)} on arrival
          </li>
        </ul>
        <p className="tabular text-2xl font-bold">from {formatINR(item.fromPricePaise)}</p>
        <ButtonLink href={`/delicacy/${item.slug}`} size="lg" className="w-fit">
          Choose a delivery date
        </ButtonLink>
        <p className="text-sm text-ink-muted">
          Made by{" "}
          <Link href={`/kitchens/${item.vendor.slug}`} className="underline">
            {item.vendor.name}
          </Link>
          , FSSAI licence {item.legal.fssaiLicenseNo}.
        </p>
      </div>
    </div>
  );
}
