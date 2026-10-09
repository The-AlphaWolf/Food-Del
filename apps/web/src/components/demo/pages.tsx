"use client";

/**
 * GitHub Pages demo: the pages the server normally renders, loaded in the browser through the
 * same API (answered by the service worker) and drawn with the same views.
 */
import { ApiError } from "@food-del/api-client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { NotFoundView } from "@/components/not-found-view";
import { CityView } from "@/components/pages/city-view";
import { DelicacyView } from "@/components/pages/delicacy-view";
import { HomeView } from "@/components/pages/home-view";
import { KitchenView } from "@/components/pages/kitchen-view";
import { type SearchQuery, SearchView } from "@/components/pages/search-view";
import { CITY_PINCODE, SendView } from "@/components/pages/send-view";
import { Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useDestination } from "@/lib/destination";

class Missing extends Error {}

function useDemoData<T>(key: unknown[], load: (pincode?: string) => Promise<T>) {
  const { pincode } = useDestination();
  const pin = pincode ?? undefined;
  const q = useQuery({
    queryKey: ["demo-page", ...key, pin ?? null],
    queryFn: () => load(pin),
    retry: (n, e) =>
      !(e instanceof Missing) && !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  return { ...q, pincode: pin };
}

function Show<T>({
  q,
  children,
}: {
  q: { data?: T; error: unknown };
  children: (data: T) => ReactNode;
}) {
  if (q.error) {
    if (q.error instanceof Missing || (q.error instanceof ApiError && q.error.status === 404))
      return <NotFoundView />;
    return (
      <p role="alert" className="container-page py-16 text-center font-semibold text-danger">
        {(q.error as Error).message}
      </p>
    );
  }
  if (q.data === undefined) {
    return (
      <div className="container-page py-12" aria-busy="true">
        <Skeleton className="mb-6 h-12 w-2/3" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      </div>
    );
  }
  return <>{children(q.data)}</>;
}

export function HomeDemo() {
  const q = useDemoData(["home"], async (pincode) => {
    const [cities, featured, categories] = await Promise.all([
      api.cities(),
      api.items({ featured: "true", pincode, limit: 8 }),
      api.categories(),
    ]);
    return { cities, featured, categories };
  });
  return <Show q={q}>{(d) => <HomeView {...d} pincode={q.pincode} />}</Show>;
}

export function CityDemo({ slug }: { slug: string }) {
  const q = useDemoData(["city", slug], async (pincode) => {
    const [cities, items, categories] = await Promise.all([
      api.cities(),
      api.items({ origin: slug, pincode, limit: 100 }),
      api.categories(),
    ]);
    const city = cities.find((c) => c.slug === slug && c.isOrigin);
    if (!city) throw new Missing();
    return { city, items, categories };
  });
  return <Show q={q}>{(d) => <CityView {...d} pincode={q.pincode} />}</Show>;
}

export function KitchenDemo({ slug }: { slug: string }) {
  const q = useDemoData(["kitchen", slug], (pincode) => api.vendor(slug, pincode));
  return <Show q={q}>{(v) => <KitchenView v={v} pincode={q.pincode} />}</Show>;
}

export function DelicacyDemo({ slug }: { slug: string }) {
  const q = useDemoData(["delicacy", slug], async (pincode) => {
    const item = await api.item(slug, pincode);
    const more = (await api.items({ vendor: item.vendor.slug, pincode, limit: 5 }))
      .filter((i) => i.id !== item.id)
      .slice(0, 4);
    return { item, more };
  });
  return <Show q={q}>{(d) => <DelicacyView {...d} pincode={q.pincode} />}</Show>;
}

export function SendDemo({ slug, city }: { slug: string; city: string }) {
  const q = useDemoData(["send", slug, city], async () => {
    const pincode = CITY_PINCODE[city];
    const dest = (await api.cities()).find((c) => c.slug === city && c.isDestination);
    if (!dest || !pincode) throw new Missing();
    return { item: await api.item(slug, pincode), dest };
  });
  return <Show q={q}>{(d) => <SendView {...d} />}</Show>;
}

function SearchResults() {
  const params = useSearchParams();
  const sp: SearchQuery = {
    q: params.get("q") ?? undefined,
    origin: params.get("origin") ?? undefined,
    category: params.get("category") ?? undefined,
    available: params.get("available") ?? undefined,
  };
  const q = useDemoData(["search", sp], async (pincode) => {
    const [cities, categories, items] = await Promise.all([
      api.cities(),
      api.categories(),
      api.items({
        q: sp.q?.slice(0, 80),
        origin: sp.origin,
        category: sp.category,
        pincode,
        limit: 100,
      }),
    ]);
    return { cities, categories, items };
  });
  return <Show q={q}>{(d) => <SearchView {...d} sp={sp} pincode={q.pincode} />}</Show>;
}

export function SearchDemo() {
  return (
    <Suspense>
      <SearchResults />
    </Suspense>
  );
}
