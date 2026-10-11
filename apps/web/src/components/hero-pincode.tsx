"use client";

import { CheckCircle2 } from "lucide-react";
import { useDestination } from "@/lib/destination";
import { PincodeForm } from "./pincode-picker";
import { ButtonLink } from "./ui/primitives";

function joinNames(names: string[]): string {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function HeroPincode({
  initial,
  destinations,
}: {
  initial: string | null;
  /** Cities we deliver to now, from live data, so a new launch shows up here by itself. */
  destinations: string[];
}) {
  const { pincode, setPincode } = useDestination();
  const current = pincode ?? initial;

  const quickAreas = [
    { name: "Indiranagar", pin: "560038" },
    { name: "Koramangala", pin: "560034" },
    { name: "HSR Layout", pin: "560102" },
    { name: "Whitefield", pin: "560066" },
  ];

  if (current) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-card p-4 shadow-card">
        <p className="flex items-center gap-2 text-sm font-semibold text-success">
          <CheckCircle2 className="size-5" aria-hidden /> Showing delivery dates for {current}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPincode(null)}
            className="text-xs font-semibold text-jaggery hover:underline"
          >
            Change area
          </button>
          <ButtonLink href="/search" size="sm">
            Browse delicacies
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-card p-4 shadow-card sm:p-5">
      <PincodeForm />
      <div className="mt-3 border-t border-line pt-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
          Living in Bengaluru? Quick-select area:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {quickAreas.map((area) => (
            <button
              key={area.pin}
              type="button"
              onClick={() => setPincode(area.pin)}
              className="rounded-md border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-jaggery/40 hover:bg-card hover:text-jaggery"
            >
              {area.name} <span className="text-[10px] text-ink-muted">({area.pin})</span>
            </button>
          ))}
        </div>
      </div>
      {destinations.length > 0 && (
        <p className="mt-3 text-xs text-ink-muted">We deliver to {joinNames(destinations)}.</p>
      )}
    </div>
  );
}
