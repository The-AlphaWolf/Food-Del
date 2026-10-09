"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ItemForm } from "@/components/ops/item-form";
import { OpsShell } from "@/components/ops-shell";
import { api } from "@/lib/api";
import { useRouteParams } from "@/lib/route-params";

function NewItem() {
  const { id } = useRouteParams<{ id: string }>();
  const kitchen = useQuery({ queryKey: ["ops-kitchen", id], queryFn: () => api.kitchen(id) });
  return (
    <>
      <Link
        href={`/ops/kitchens/${id}`}
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-jaggery"
      >
        <ArrowLeft className="size-4" aria-hidden /> {kitchen.data?.name ?? "Kitchen"}
      </Link>
      <h1 className="mb-1 text-3xl font-extrabold">Add a delicacy</h1>
      <p className="mb-6 text-ink-soft">
        It's saved as a draft. Shoppers see it once you put it on sale and the kitchen is live.
      </p>
      <ItemForm kitchenId={id} />
    </>
  );
}

export function NewItemPage() {
  return (
    <OpsShell>
      <NewItem />
    </OpsShell>
  );
}
