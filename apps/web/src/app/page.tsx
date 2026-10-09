import { HomeDemo } from "@/components/demo/pages";
import { HomeView } from "@/components/pages/home-view";
import { STATIC_DEMO } from "@/lib/demo";
import { currentPincode, getCore } from "@/server/data";

// Live stock and dates per request. (The GitHub Pages build switches this to "force-static";
// see scripts/build-pages.mjs.)
export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (STATIC_DEMO) return <HomeDemo />;
  const core = getCore();
  const pincode = await currentPincode();
  const [cities, featured, categories] = await Promise.all([
    core.catalog.listCities(),
    core.catalog.listItems({ featured: "true", pincode, limit: 8 }),
    core.catalog.listCategories(),
  ]);
  return <HomeView cities={cities} featured={featured} categories={categories} pincode={pincode} />;
}
