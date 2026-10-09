import type { MetadataRoute } from "next";
import { getCore } from "@/server/core";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

/** Every delicacy, origin city, kitchen and the "send X to Y" landing pages. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const core = getCore();
  const [cities, items] = await Promise.all([
    core.catalog.listCities(),
    core.catalog.listItems({ limit: 100 }),
  ]);
  const destinations = cities.filter((c) => c.isDestination && c.launchStatus === "LIVE");
  const kitchens = [...new Set(items.map((i) => i.vendor.slug))];
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/how-it-works`, changeFrequency: "monthly" },
    ...cities
      .filter((c) => c.isOrigin)
      .map((c) => ({
        url: `${base}/from/${c.slug}`,
        changeFrequency: "daily" as const,
        priority: 0.8,
      })),
    ...items.map((i) => ({
      url: `${base}/delicacy/${i.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    ...kitchens.map((k) => ({ url: `${base}/kitchens/${k}`, changeFrequency: "weekly" as const })),
    ...items.flatMap((i) =>
      destinations
        .filter((d) => d.slug !== i.vendor.city.slug)
        .map((d) => ({
          url: `${base}/send/${i.slug}/to/${d.slug}`,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        })),
    ),
  ];
}
