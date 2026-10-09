"use client";

import { MapPin } from "lucide-react";
import { useDestination } from "@/lib/destination";
import { PincodeForm } from "./pincode-picker";

/** One prompt per list page, instead of "set your pincode" on every card. */
export function PincodePrompt({ initial }: { initial: string | null }) {
  const { pincode } = useDestination();
  if (pincode ?? initial) return null;
  return (
    <div className="mb-8 grid gap-4 rounded-lg border border-line bg-card p-4 shadow-card sm:grid-cols-[1fr_minmax(0,22rem)] sm:items-end sm:p-5">
      <div className="flex gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-saffron-soft text-jaggery">
          <MapPin className="size-5" aria-hidden />
        </span>
        <div>
          <p className="font-semibold text-ink">See when each delicacy can reach you</p>
          <p className="text-sm text-ink-soft">
            Delivery dates, shipping and cold-chain packing depend on your pincode.
          </p>
        </div>
      </div>
      <PincodeForm />
    </div>
  );
}
