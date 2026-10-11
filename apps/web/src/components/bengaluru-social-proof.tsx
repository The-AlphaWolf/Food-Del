"use client";

import {
  CalendarClock,
  Heart,
  MessageSquareQuote,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/primitives";

export function WeekendFeastBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-jaggery/30 bg-gradient-to-br from-jaggery/10 via-card to-saffron/10 p-6 shadow-card sm:p-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-jaggery text-on-jaggery">
              <CalendarClock className="size-4" aria-hidden />
            </span>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-jaggery">
              Bengaluru Weekend Drop
            </p>
          </div>
          <h3 className="mt-2 text-2xl font-extrabold text-ink sm:text-3xl">
            Planning a weekend adda or family feast?
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft sm:text-base">
            Cross-city delicacies take 24–36 hours by air cargo. Pre-order by{" "}
            <strong>Thursday 6:00 PM IST</strong> to guarantee morning flight dispatch and
            Saturday/Sunday doorstep delivery anywhere in Bengaluru.
          </p>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-ink-soft">
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 font-medium">
              <Sparkles className="size-3 text-saffron" aria-hidden /> 0–8 °C Passive Coolant
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 font-medium">
              <Users className="size-3 text-jaggery" aria-hidden /> Perfect for 4–8 people
              gatherings
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 font-medium">
              <Heart className="size-3 text-danger" aria-hidden /> 100% Authentic Origin Sourced
            </span>
          </div>
        </div>

        <div className="shrink-0">
          <ButtonLink href="/search" size="lg">
            Schedule Weekend Pre-Order
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

export function TrendingInBengaluru() {
  const trendingStats = [
    {
      city: "Kolkata Hub",
      count: "184 Boxes",
      detail: "Nolen Gur Sandesh & Rosogolla to Koramangala & Whitefield",
      origin: "Bagbazar & College Street",
    },
    {
      city: "Hyderabad Hub",
      count: "128 Tins",
      detail: "Osmania Biscuits & Badam Jaali to HSR Layout & Bellandur",
      origin: "Nampally Bakehouse",
    },
    {
      city: "Old Delhi Hub",
      count: "96 Boxes",
      detail: "Sohan Halwa & Ajwain Mathri to Indiranagar & Electronic City",
      origin: "Chandni Chowk Halwai",
    },
  ];

  const communityNotes = [
    {
      quote:
        "Tastes 100% authentic like College Street mornings. Finally don't have to wait for someone returning from Kolkata!",
      author: "Anirban M.",
      neighborhood: "Whitefield, Bengaluru",
      favorite: "Nolen Gur Sandesh",
    },
    {
      quote:
        "Authentic Osmania biscuits with evening chai after a long sprint at EcoSpace. Crisp and nostalgic.",
      author: "Syed R.",
      neighborhood: "Bellandur, Bengaluru",
      favorite: "Osmania Biscuits",
    },
    {
      quote:
        "Generations-old Chandni Chowk flavor. Arrived in perfect chilled packaging without any melting.",
      author: "Prateek S.",
      neighborhood: "HSR Layout, Bengaluru",
      favorite: "Sohan Halwa",
    },
  ];

  return (
    <section className="container-page py-12 md:py-16" aria-labelledby="trending-bengaluru-title">
      <div className="mb-8 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-jaggery" aria-hidden />
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-jaggery">
            Community Love
          </p>
        </div>
        <h2
          id="trending-bengaluru-title"
          className="text-2xl font-extrabold text-ink sm:text-3xl md:text-4xl"
        >
          Trending Across Bengaluru
        </h2>
        <p className="text-sm text-ink-soft sm:text-base">
          What your fellow homesick colleagues and neighbors are ordering this week.
        </p>
      </div>

      {/* Trending Lane Highlights */}
      <div className="grid gap-4 sm:grid-cols-3">
        {trendingStats.map((stat) => (
          <div
            key={stat.city}
            className="flex flex-col justify-between rounded-xl border border-line bg-card p-5 shadow-xs transition-shadow hover:shadow-card"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-jaggery">
                  {stat.city}
                </span>
                <span className="rounded-full bg-jaggery/10 px-2.5 py-0.5 text-xs font-extrabold text-jaggery">
                  {stat.count}
                </span>
              </div>
              <p className="mt-3 text-sm font-bold text-ink">{stat.detail}</p>
            </div>
            <p className="mt-4 border-t border-line pt-3 text-[11px] text-ink-muted">
              Sourced directly from{" "}
              <span className="text-ink-soft font-semibold">{stat.origin}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Community Quotes */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {communityNotes.map((note) => (
          <div
            key={note.author}
            className="flex flex-col justify-between rounded-xl border border-line bg-paper-deep/50 p-5"
          >
            <div>
              <MessageSquareQuote className="size-6 text-jaggery/40" aria-hidden />
              <p className="mt-2 text-sm italic text-ink-soft leading-relaxed">"{note.quote}"</p>
            </div>
            <div className="mt-4 border-t border-line pt-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-ink">{note.author}</p>
                <p className="text-[11px] text-ink-muted">{note.neighborhood}</p>
              </div>
              <span className="text-[10px] font-semibold text-jaggery bg-jaggery/10 px-2 py-0.5 rounded">
                {note.favorite}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
