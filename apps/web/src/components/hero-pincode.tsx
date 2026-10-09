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
  const { pincode } = useDestination();
  const current = pincode ?? initial;
  if (current) {
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-card p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-success">
          <CheckCircle2 className="size-5" aria-hidden /> Showing delivery dates for {current}
        </p>
        <ButtonLink href="/search">Browse delicacies</ButtonLink>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-line bg-card p-4 shadow-card">
      <PincodeForm />
      {destinations.length > 0 && (
        <p className="mt-2 text-xs text-ink-muted">We deliver to {joinNames(destinations)}.</p>
      )}
    </div>
  );
}
