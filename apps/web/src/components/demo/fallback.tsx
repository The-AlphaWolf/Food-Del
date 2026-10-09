"use client";

import { type ReactNode, useEffect, useState } from "react";
import { ItemPage as OpsItemPage } from "@/app/ops/items/[id]/screen";
import { EditKitchenPage } from "@/app/ops/kitchens/[id]/edit/screen";
import { NewItemPage } from "@/app/ops/kitchens/[id]/items/new/screen";
import { KitchenPage as OpsKitchenPage } from "@/app/ops/kitchens/[id]/screen";
import { OrderDetailPage } from "@/app/orders/[id]/screen";
import { VendorDayPage } from "@/app/vendor/[vendorId]/day/[date]/screen";
import { InventoryPage } from "@/app/vendor/[vendorId]/inventory/screen";
import { CityDemo, DelicacyDemo, KitchenDemo, SendDemo } from "@/components/demo/pages";
import { NotFoundView } from "@/components/not-found-view";
import { BASE_PATH } from "@/lib/demo";
import { RouteParamsProvider } from "@/lib/route-params";

type Match = { params: Record<string, string>; render: () => ReactNode };

const ROUTES: [RegExp, string[], (p: Record<string, string>) => ReactNode][] = [
  [/^\/delicacy\/([^/]+)$/, ["slug"], (p) => <DelicacyDemo slug={p.slug!} />],
  [/^\/kitchens\/([^/]+)$/, ["slug"], (p) => <KitchenDemo slug={p.slug!} />],
  [/^\/from\/([^/]+)$/, ["city"], (p) => <CityDemo slug={p.city!} />],
  [
    /^\/send\/([^/]+)\/to\/([^/]+)$/,
    ["slug", "city"],
    (p) => <SendDemo slug={p.slug!} city={p.city!} />,
  ],
  [/^\/orders\/([^/]+)$/, ["id"], () => <OrderDetailPage />],
  [/^\/ops\/items\/([^/]+)$/, ["id"], () => <OpsItemPage />],
  [/^\/ops\/kitchens\/([^/]+)$/, ["id"], () => <OpsKitchenPage />],
  [/^\/ops\/kitchens\/([^/]+)\/edit$/, ["id"], () => <EditKitchenPage />],
  [/^\/ops\/kitchens\/([^/]+)\/items\/new$/, ["id"], () => <NewItemPage />],
  [/^\/vendor\/([^/]+)\/day\/([^/]+)$/, ["vendorId", "date"], () => <VendorDayPage />],
  [/^\/vendor\/([^/]+)\/inventory$/, ["vendorId"], () => <InventoryPage />],
];

function match(pathname: string): Match | null {
  const path = pathname.slice(BASE_PATH.length).replace(/\/+$/, "") || "/";
  for (const [re, keys, render] of ROUTES) {
    const m = re.exec(path);
    if (!m) continue;
    const params = Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
    return { params, render: () => render(params) };
  }
  return null;
}

/**
 * The demo's 404 page. GitHub Pages serves it for paths with no pre-built file: the screens for
 * orders, kitchens and delicacies created in this browser. It renders them from the URL.
 */
export function DemoFallback() {
  // Decided after mount so the pre-rendered HTML and the first client render agree.
  const [found, setFound] = useState<Match | null | undefined>(undefined);
  useEffect(() => setFound(match(window.location.pathname)), []);
  if (found === undefined) return <div className="min-h-[60vh]" aria-busy="true" />;
  if (!found) return <NotFoundView />;
  return <RouteParamsProvider value={found.params}>{found.render()}</RouteParamsProvider>;
}
