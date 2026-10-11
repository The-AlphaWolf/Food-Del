"use client";

import { Check, MapPin } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useDestination } from "@/lib/destination";
import { PincodeForm } from "./pincode-picker";

export interface BengaluruArea {
  name: string;
  pincode: string;
  landmark: string;
}

export const BENGALURU_AREAS: BengaluruArea[] = [
  { name: "Koramangala", pincode: "560034", landmark: "Sony World / 4th Block" },
  { name: "Indiranagar", pincode: "560038", landmark: "100ft Road / CMH" },
  { name: "HSR Layout", pincode: "560102", landmark: "Sector 1–7 Tech Hub" },
  { name: "Whitefield", pincode: "560066", landmark: "ITPL / Hope Farm" },
  { name: "Bellandur / ORR", pincode: "560103", landmark: "EcoSpace / Kadubeesanahalli" },
  { name: "Electronic City", pincode: "560100", landmark: "Phase 1 / Velankani" },
  { name: "Malleshwaram", pincode: "560003", landmark: "8th Cross / Sampige" },
  { name: "Jayanagar", pincode: "560011", landmark: "4th Block Complex" },
];

export function BengaluruNeighborhoodPicker({
  initialPincode,
  onSelected,
}: {
  initialPincode?: string | null;
  onSelected?: (pincode: string) => void;
}) {
  const { pincode, setPincode } = useDestination();
  const currentPin = pincode ?? initialPincode ?? null;
  const [showCustomInput, setShowCustomInput] = useState(false);

  const activeArea = BENGALURU_AREAS.find((a) => a.pincode === currentPin);

  function selectArea(areaPin: string) {
    setPincode(areaPin);
    setShowCustomInput(false);
    onSelected?.(areaPin);
  }

  return (
    <div className="rounded-xl border border-line bg-card p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-jaggery/10 text-jaggery">
            <MapPin className="size-4" aria-hidden />
          </span>
          <div>
            <h3 className="text-sm font-bold text-ink">Delivering to Bengaluru</h3>
            <p className="text-xs text-ink-muted">
              {activeArea ? (
                <>
                  Selected:{" "}
                  <strong className="text-ink">
                    {activeArea.name} ({activeArea.pincode})
                  </strong>
                </>
              ) : currentPin ? (
                <>
                  Delivering to pincode <strong className="text-ink">{currentPin}</strong>
                </>
              ) : (
                "Select your neighborhood for instant delivery dates & flight cutoffs"
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowCustomInput(!showCustomInput)}
          className="text-xs font-semibold text-jaggery hover:underline"
        >
          {showCustomInput ? "Hide custom input" : "Other pincode?"}
        </button>
      </div>

      {showCustomInput ? (
        <div className="pt-3">
          <PincodeForm onDone={() => setShowCustomInput(false)} autoFocus />
        </div>
      ) : (
        <div className="pt-3">
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
            Quick-Select Neighborhood
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BENGALURU_AREAS.map((area) => {
              const isSelected = area.pincode === currentPin;
              return (
                <button
                  key={area.pincode}
                  type="button"
                  onClick={() => selectArea(area.pincode)}
                  className={cn(
                    "group relative flex flex-col items-start rounded-lg border p-2.5 text-left transition-all duration-150",
                    isSelected
                      ? "border-jaggery bg-jaggery/5 shadow-sm ring-1 ring-jaggery"
                      : "border-line bg-paper hover:border-jaggery/40 hover:bg-card hover:shadow-xs",
                  )}
                >
                  <div className="flex w-full items-center justify-between gap-1">
                    <span className="text-xs font-bold text-ink group-hover:text-jaggery">
                      {area.name}
                    </span>
                    {isSelected && <Check className="size-3.5 shrink-0 text-jaggery" aria-hidden />}
                  </div>
                  <span className="mt-0.5 text-[10px] text-ink-muted truncate w-full">
                    {area.landmark}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
