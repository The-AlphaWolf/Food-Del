import type { Metadata } from "next";
import { SearchDemo } from "@/components/demo/pages";
import { type SearchQuery, SearchView } from "@/components/pages/search-view";
import { STATIC_DEMO } from "@/lib/demo";
import { currentPincode, getCore } from "@/server/data";

// Live stock and dates per request. (The GitHub Pages build switches this to "force-static";
// see scripts/build-pages.mjs.)
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Browse delicacies" };

type Props = { searchParams: Promise<SearchQuery> };

export default async function SearchPage({ searchParams }: Props) {
  if (STATIC_DEMO) return <SearchDemo />;
  const sp = await searchParams;
  const pincode = await currentPincode();
  const core = getCore();
  const [cities, categories, items] = await Promise.all([
    core.catalog.listCities(),
    core.catalog.listCategories(),
    core.catalog.listItems({
      q: sp.q?.slice(0, 80),
      origin: sp.origin,
      category: sp.category,
      pincode,
      limit: 100,
    }),
  ]);
  return (
    <SearchView sp={sp} cities={cities} categories={categories} items={items} pincode={pincode} />
  );
}
