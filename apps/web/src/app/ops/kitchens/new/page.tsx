"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { KitchenForm } from "@/components/ops/kitchen-form";
import { OpsShell } from "@/components/ops-shell";

export default function NewKitchenPage() {
  return (
    <OpsShell>
      <div className="mx-auto max-w-4xl">
        <Link
          href="/ops/kitchens"
          className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-jaggery"
        >
          <ArrowLeft className="size-4" aria-hidden /> Kitchens
        </Link>
        <h1 className="mb-1 text-3xl font-extrabold">Add a kitchen</h1>
        <p className="mb-6 text-ink-soft">
          About five minutes. Have the FSSAI licence and the owner's mobile number to hand.
        </p>
        <KitchenForm />
      </div>
    </OpsShell>
  );
}
