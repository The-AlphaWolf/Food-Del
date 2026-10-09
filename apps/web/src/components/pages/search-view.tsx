import type { Category, City, ItemCard } from "@food-del/domain/contracts";
import { Check, Search } from "lucide-react";
import Link from "next/link";
import { ItemGrid } from "@/components/item-card";
import { PincodePrompt } from "@/components/pincode-prompt";
import { EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { BASE_PATH, STATIC_DEMO } from "@/lib/demo";

export interface SearchQuery {
  q?: string;
  origin?: string;
  category?: string;
  available?: string;
}

export interface SearchData {
  cities: City[];
  categories: Category[];
  items: ItemCard[];
}

function hrefWith(
  current: Record<string, string | undefined>,
  patch: Record<string, string | undefined>,
) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/search?${s}` : "/search";
}

export function SearchView({
  sp,
  cities,
  categories,
  items,
  pincode,
}: SearchData & { sp: SearchQuery; pincode?: string }) {
  const shown =
    sp.available === "1" && pincode ? items.filter((i) => i.delivery?.available) : items;
  const current = { q: sp.q, origin: sp.origin, category: sp.category, available: sp.available };

  return (
    <div className="container-page py-10">
      <h1 className="mb-6 text-4xl font-extrabold">Browse delicacies</h1>
      <form
        action={`${BASE_PATH}/search${STATIC_DEMO ? "/" : ""}`}
        className="mb-6 flex max-w-xl gap-2"
        role="search"
      >
        {sp.origin && <input type="hidden" name="origin" value={sp.origin} />}
        {sp.category && <input type="hidden" name="category" value={sp.category} />}
        <label htmlFor="q" className="sr-only">
          Search
        </label>
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden
          />
          <input
            id="q"
            name="q"
            defaultValue={sp.q}
            placeholder="Sandesh, halwa, Hyderabad…"
            className="h-11 w-full rounded-md border border-line-strong bg-card pl-9 pr-3 text-[15px] focus:border-jaggery focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="h-11 rounded-md bg-jaggery px-4 font-semibold text-white hover:bg-jaggery-deep"
        >
          Search
        </button>
      </form>

      <div className="mb-8 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Origin city">
          <span className="mr-1 text-sm font-bold text-ink-muted">From</span>
          {[{ slug: undefined, name: "Everywhere" }, ...cities.filter((c) => c.isOrigin)].map(
            (c) => (
              <Link
                key={c.slug ?? "all"}
                href={hrefWith(current, { origin: c.slug })}
                aria-current={sp.origin === c.slug ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-pill border px-4 text-sm font-semibold",
                  sp.origin === c.slug
                    ? "border-jaggery bg-jaggery text-white"
                    : "border-line-strong bg-card hover:border-jaggery",
                )}
              >
                {c.name}
              </Link>
            ),
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Category">
          <span className="mr-1 text-sm font-bold text-ink-muted">Type</span>
          {[{ slug: undefined, name: "All" }, ...categories].map((c) => (
            <Link
              key={c.slug ?? "all"}
              href={hrefWith(current, { category: c.slug })}
              aria-current={sp.category === c.slug ? "true" : undefined}
              className={cn(
                "rounded-pill border px-3.5 py-1.5 text-sm font-semibold",
                sp.category === c.slug
                  ? "border-jaggery bg-jaggery text-white"
                  : "border-line-strong bg-card hover:border-jaggery",
              )}
            >
              {c.name}
            </Link>
          ))}
        </div>
        {pincode && (
          <Link
            href={hrefWith(current, { available: sp.available === "1" ? undefined : "1" })}
            className="flex w-fit items-center gap-2 text-sm font-semibold"
            aria-pressed={sp.available === "1"}
          >
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded border",
                sp.available === "1"
                  ? "border-jaggery bg-jaggery text-white"
                  : "border-line-strong bg-card",
              )}
            >
              {sp.available === "1" && <Check className="size-3.5" aria-hidden />}
            </span>
            Only show what can reach {pincode}
          </Link>
        )}
      </div>

      <PincodePrompt initial={pincode ?? null} />
      <p className="mb-4 text-sm text-ink-muted" aria-live="polite">
        {shown.length} {shown.length === 1 ? "delicacy" : "delicacies"}
      </p>
      {shown.length === 0 ? (
        <EmptyState
          icon={<Search className="size-8" />}
          title="No matches"
          body="Try another search, or browse everything from one city."
          action={
            <Link href="/search" className="font-semibold text-jaggery underline">
              Clear filters
            </Link>
          }
        />
      ) : (
        <ItemGrid items={shown} />
      )}
    </div>
  );
}
