"use client";

import { ApiError } from "@food-del/api-client";
import { queryKeys } from "@food-del/api-client/react";
import type { Me } from "@food-del/domain/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { finishPhoneLogin, startPhoneLogin } from "@/lib/auth";
import { Button, Field, Input } from "./ui/primitives";

function message(e: unknown): string {
  if (e instanceof ApiError || e instanceof Error) return e.message;
  return "Something went wrong. Please try again.";
}

/** Two-step phone OTP sign-in. */
export function LoginForm({
  onSignedIn,
  compact = false,
}: {
  onSignedIn: (me: Me) => void;
  compact?: boolean;
}) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const qc = useQueryClient();

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await startPhoneLogin(phone);
      setDevCode(r.devCode);
      setStep("code");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await finishPhoneLogin(phone, code);
      // Pages may have fetched the profile mid-sign-in; this one includes the notice receipt.
      await qc.cancelQueries({ queryKey: queryKeys.me });
      qc.setQueryData(queryKeys.me, me);
      onSignedIn(me);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  if (step === "phone") {
    return (
      <form onSubmit={sendCode} className="flex flex-col gap-4" noValidate>
        <Field
          label="Mobile number"
          htmlFor={`${id}-phone`}
          error={error}
          hint="We'll send a 6-digit code by SMS."
        >
          <div className="flex">
            <span className="flex h-11 items-center rounded-l-md border border-r-0 border-field bg-paper-deep px-3 text-sm font-semibold text-ink-soft">
              +91
            </span>
            <Input
              id={`${id}-phone`}
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="98450 12345"
              className="tabular rounded-l-none"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={Boolean(error)}
              autoFocus={!compact}
            />
          </div>
        </Field>
        <Button type="submit" loading={busy} size="lg">
          Send code
        </Button>
        <p className="text-xs text-ink-muted">
          We use your number to sign you in and send updates about your orders, and your addresses
          to deliver them. Read our{" "}
          <Link href="/privacy" target="_blank" className="font-semibold text-jaggery underline">
            privacy notice
          </Link>
          .
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
      {devCode && (
        <p className="flex items-start gap-2 rounded-md bg-info-soft p-3 text-sm text-info">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Development mode: your code is <strong className="tabular">{devCode}</strong>.
          </span>
        </p>
      )}
      <Field label={`Code sent to +91 ${phone}`} htmlFor={`${id}-code`} error={error}>
        <Input
          id={`${id}-code`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="tabular tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          aria-invalid={Boolean(error)}
          autoFocus
        />
      </Field>
      <Button type="submit" loading={busy} size="lg" disabled={code.length !== 6}>
        Verify and continue
      </Button>
      <button
        type="button"
        className="self-start text-sm font-semibold text-jaggery hover:underline"
        onClick={() => setStep("phone")}
      >
        Use a different number
      </button>
    </form>
  );
}
