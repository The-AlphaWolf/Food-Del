"use client";

import type { City, ItemCard } from "@food-del/domain/contracts";
import { ArrowRight, Plane, ShieldCheck, Sparkles, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CITY_HERO_PHOTOS } from "@/components/item-art";
import { ItemCard as ItemCardComponent } from "@/components/item-card";
import { cn } from "@/lib/cn";

export interface HometownHubMeta {
  citySlug: string;
  tabLabel: string;
  headline: string;
  story: string;
  laneCreds: string;
  flightSchedule: string;
  coldChainNote: string;
  kitchenHighlight: string;
  popularItems: string[];
}

export const HOMETOWN_HUBS: HometownHubMeta[] = [
  {
    citySlug: "kolkata",
    tabLabel: "Craving Kolkata?",
    headline: "The legendary mishti lanes of North Kolkata",
    story:
      "Nothing in Bengaluru compares to fresh chhena pressed at dawn or seasonal Nolen Gur arriving from Nadia. Handcrafted by heritage halwais in Bagbazar and College Street, flown direct to BLR in temperature-controlled passive cold boxes.",
    laneCreds: "Air express via CCU → BLR (Cargo flight daily)",
    flightSchedule: "Next batch locks at 6:00 PM IST · Delivered in 24–36 hrs",
    coldChainNote: "Passive gel-PCM cold packaging · 0–8 °C preserved",
    kitchenHighlight: "Bagbazar Mishti Ghar (Est. 1921) & College Street Chanachur",
    popularItems: ["Nolen Gur Sandesh", "Baked Rosogolla", "Kolkata Chanachur"],
  },
  {
    citySlug: "hyderabad",
    tabLabel: "Missing Hyderabad?",
    headline: "Irani chai biscuit crunch & Deccan royal sweets",
    story:
      "Missing that authentic afternoon chai pairing from Charminar and Nampally? Freshly baked Osmania biscuits, melt-in-mouth Badam ki Jaali, and royal Qubani ka Meetha — baked to order, sealed airtight, and flown straight to Bengaluru.",
    laneCreds: "Air freight via HYD → BLR",
    flightSchedule: "Morning flight batch · Arrives next day afternoon",
    coldChainNote: "Nitrogen flushed & moisture-shielded packaging",
    kitchenHighlight: "Nampally Bakehouse & Old City Sweets & Pickles",
    popularItems: ["Osmania Biscuits", "Karachi Fruit Biscuits", "Double ka Meetha"],
  },
  {
    citySlug: "delhi-ncr",
    tabLabel: "Taste of Old Delhi",
    headline: "Chandni Chowk halwais stirring pure desi ghee",
    story:
      "Generations of karigars in the narrow alleys of Chandni Chowk and Daryaganj. Rich Sohan Halwa, spiced Dal Moth, and flaky Ajwain Mathri that keep their genuine northern aroma and crispness all the way to your Bengaluru flat.",
    laneCreds: "Air cargo via DEL → BLR",
    flightSchedule: "Daily air dispatch · 30-hour doorstep transit",
    coldChainNote: "Aroma-lock tins & crush-proof layered packing",
    kitchenHighlight: "Chandni Chowk Halwai & Sons & Daryaganj Namkeen",
    popularItems: ["Sohan Halwa", "Kaju Katli", "Ajwain Mathri"],
  },
  {
    citySlug: "bengaluru",
    tabLabel: "Flavors of Mysuru",
    headline: "Old Mysore country ghee sweets & heritage savories",
    story:
      "Traditional Karnataka delicacies made with pure country butter and jaggery. From melt-in-the-mouth Ghee Mysore Pak and golden Dharwad Peda to Malleshwaram's spicy Congress Kadlekai and Benne Murukku.",
    laneCreds: "Direct surface express across Karnataka corridors",
    flightSchedule: "Same-day artisan dispatch · 24-hr fresh delivery",
    coldChainNote: "Freshness-certified daily batches",
    kitchenHighlight: "Chamarajpet Ghee Sweets & Malleshwaram Snack Works",
    popularItems: ["Ghee Mysore Pak", "Dharwad Peda", "Congress Kadlekai"],
  },
];

export function HometownHubs({ cities, items }: { cities: City[]; items: ItemCard[] }) {
  const [activeSlug, setActiveSlug] = useState<string>("kolkata");

  const currentHub = HOMETOWN_HUBS.find((h) => h.citySlug === activeSlug) ?? HOMETOWN_HUBS[0]!;
  const currentCity = cities.find((c) => c.slug === activeSlug);

  // Filter items matching the active city
  const cityItems = items.filter((item) => item.vendor.city.slug === activeSlug);
  const heroImage = CITY_HERO_PHOTOS[activeSlug] ?? CITY_HERO_PHOTOS.kolkata;

  return (
    <section className="container-page py-12 md:py-16" aria-labelledby="hometown-hubs-title">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-jaggery">
            Homesick in Bengaluru?
          </p>
          <h2
            id="hometown-hubs-title"
            className="text-2xl font-extrabold text-ink sm:text-3xl md:text-4xl"
          >
            Taste Your Hometown Roots
          </h2>
          <p className="mt-1 text-sm text-ink-soft sm:text-base">
            Iconic regional specialties made in their home cities and delivered fresh to your
            Bengaluru doorstep.
          </p>
        </div>
        <Link
          href="/search"
          className="inline-flex items-center gap-1 text-sm font-semibold text-jaggery hover:underline"
        >
          View all cross-city delicacies <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {HOMETOWN_HUBS.map((hub) => {
          const isActive = hub.citySlug === activeSlug;
          return (
            <button
              key={hub.citySlug}
              type="button"
              onClick={() => setActiveSlug(hub.citySlug)}
              className={cn(
                "group flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all duration-200",
                isActive
                  ? "bg-jaggery text-on-jaggery shadow-md"
                  : "border border-line bg-card text-ink-soft hover:border-jaggery/40 hover:bg-paper hover:text-ink",
              )}
            >
              <Sparkles
                className={cn(
                  "size-3.5 transition-transform",
                  isActive ? "text-saffron scale-110" : "text-ink-muted",
                )}
                aria-hidden
              />
              <span>{hub.tabLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Featured Hub Hero Card */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
        <div className="grid md:grid-cols-2">
          {/* Visual Side */}
          <div className="relative min-h-[220px] overflow-hidden md:min-h-[340px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImage}
              alt={currentCity?.name ?? currentHub.headline}
              loading="lazy"
              className="h-full w-full object-cover object-center transition-transform duration-700 ease-out hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/15" />

            <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-6">
              <span className="inline-block rounded-full bg-saffron/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-black backdrop-blur-xs">
                {currentCity?.name ?? "Regional Hub"}
              </span>
              <h3 className="mt-2 text-xl font-extrabold leading-snug sm:text-2xl">
                {currentHub.headline}
              </h3>
              <p className="mt-1 text-xs text-white/80 sm:text-sm">
                Authentic kitchens:{" "}
                <strong className="text-white">{currentHub.kitchenHighlight}</strong>
              </p>
            </div>
          </div>

          {/* Details & Guarantees Side */}
          <div className="flex flex-col justify-between p-5 sm:p-6 md:p-8">
            <div>
              <p className="text-sm leading-relaxed text-ink-soft sm:text-base">
                {currentHub.story}
              </p>

              <div className="mt-6 space-y-3 border-t border-line pt-5">
                <div className="flex items-start gap-2.5">
                  <Plane className="mt-0.5 size-4 shrink-0 text-jaggery" aria-hidden />
                  <div>
                    <p className="text-xs font-bold text-ink">{currentHub.laneCreds}</p>
                    <p className="text-[11px] text-ink-muted">{currentHub.flightSchedule}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  <div>
                    <p className="text-xs font-bold text-ink">Cold-Chain Freshness Assurance</p>
                    <p className="text-[11px] text-ink-muted">{currentHub.coldChainNote}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <UtensilsCrossed className="mt-0.5 size-4 shrink-0 text-saffron" aria-hidden />
                  <div>
                    <p className="text-xs font-bold text-ink">Original Heritage Artisans</p>
                    <p className="text-[11px] text-ink-muted">
                      No local Bangalore replicas. Sourced only from verified origin creators.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <span className="text-xs text-ink-muted">
                Popular: {currentHub.popularItems.join(" · ")}
              </span>
              <Link
                href={`/from/${currentHub.citySlug}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-jaggery/10 px-3.5 py-1.5 text-xs font-bold text-jaggery transition-colors hover:bg-jaggery hover:text-on-jaggery"
              >
                Explore all {currentCity?.name} delicacies{" "}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Featured Delicacies from this Hub */}
      {cityItems.length > 0 && (
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-muted">
              Signature Delicacies from {currentCity?.name}
            </h4>
            <span className="text-xs text-ink-muted">{cityItems.length} available</span>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cityItems.slice(0, 4).map((item) => (
              <li key={item.id}>
                <ItemCardComponent item={item} context="city" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
