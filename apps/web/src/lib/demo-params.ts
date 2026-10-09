import "server-only";
import { CITY_SEED, VENDOR_SEED } from "@food-del/db/seed";
import type { Metadata } from "next";
import { CITY_PINCODE } from "@/components/pages/send-view";

/**
 * Route params and titles for the GitHub Pages export, from the seed catalogue (the same data
 * the in-browser database starts with), so the build needs no database. Kitchens and
 * delicacies created later in the demo open through the 404 fallback instead.
 */
const items = VENDOR_SEED.flatMap((v) =>
  v.items.map((i) => ({ ...i, vendor: v, city: CITY_SEED.find((c) => c.slug === v.city) })),
);

export const demoParams = {
  cities: () => CITY_SEED.filter((c) => c.isOrigin).map((c) => ({ city: c.slug })),
  kitchens: () => VENDOR_SEED.map((v) => ({ slug: v.slug })),
  delicacies: () => items.map((i) => ({ slug: i.slug })),
  sends: () =>
    items.flatMap((i) => Object.keys(CITY_PINCODE).map((city) => ({ slug: i.slug, city }))),

  cityMetadata(slug: string): Metadata {
    const c = CITY_SEED.find((x) => x.slug === slug);
    return c ? { title: `Delicacies from ${c.name}`, description: `${c.tagline}.` } : {};
  },
  kitchenMetadata(slug: string): Metadata {
    const v = VENDOR_SEED.find((x) => x.slug === slug);
    return v ? { title: v.name, description: v.tagline } : {};
  },
  delicacyMetadata(slug: string): Metadata {
    const i = items.find((x) => x.slug === slug);
    return i
      ? { title: `${i.name} from ${i.city?.name ?? i.vendor.city}`, description: i.short }
      : {};
  },
  sendMetadata(slug: string, city: string): Metadata {
    const i = items.find((x) => x.slug === slug);
    const dest = CITY_SEED.find((c) => c.slug === city);
    return i && dest ? { title: `Send ${i.name} to ${dest.name}` } : {};
  },
};
