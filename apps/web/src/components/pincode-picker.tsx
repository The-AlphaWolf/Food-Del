"use client";

import { isValidPincode, normalisePincode } from "@food-del/domain";
import { MapPin } from "lucide-react";
import { useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useDestination } from "@/lib/destination";
import { Button, Input } from "./ui/primitives";

/** Inline pincode form; used in the header dialog, on item pages and in the cart. */
export function PincodeForm({
  onDone,
  autoFocus = false,
}: {
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const { pincode, setPincode } = useDestination();
  const [value, setValue] = useState(pincode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const pin = normalisePincode(value);
    if (!isValidPincode(pin)) {
      setError("Enter a valid 6-digit pincode.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.pincode(pin);
      if (!r.serviceable) {
        setError(r.message ?? "We don't deliver there yet.");
        return;
      }
      setPincode(pin);
      onDone?.();
    } catch {
      setError("Couldn't check that pincode. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <label htmlFor={id} className="text-sm font-semibold">
        Deliver to pincode
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={7}
          placeholder="e.g. 560038"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="tabular"
        />
        <Button type="submit" loading={busy}>
          Check
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/** Header control: shows the current destination and opens the pincode dialog. */
export function PincodeButton() {
  const { pincode } = useDestination();
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="flex min-h-11 items-center gap-1.5 rounded-md px-2 text-left text-sm hover:bg-paper-deep"
      >
        <MapPin className="size-4 shrink-0 text-jaggery" aria-hidden />
        <span className="leading-tight">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Deliver to
          </span>
          <span className="tabular font-semibold text-ink">{pincode ?? "Set pincode"}</span>
        </span>
      </button>
      <dialog
        ref={dialog}
        className="m-auto w-[min(92vw,26rem)] rounded-xl border border-line bg-card p-6 text-ink shadow-lift"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") dialog.current?.close();
        }}
      >
        <h2 className="mb-1 text-xl font-bold">Where should it arrive?</h2>
        <p className="mb-4 text-sm text-ink-soft">
          Delivery dates, cold-chain packaging and shipping depend on how far the kitchen is from
          you.
        </p>
        <PincodeForm onDone={() => dialog.current?.close()} />
      </dialog>
    </>
  );
}
