"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { KitchenForm } from "@/components/ops/kitchen-form";
import { OpsShell } from "@/components/ops-shell";
import { Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";

function Edit() {
  const { id } = useParams<{ id: string }>();
  const kitchen = useQuery({ queryKey: ["ops-kitchen", id], queryFn: () => api.kitchen(id) });
  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/ops/kitchens/${id}`}
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-jaggery"
      >
        <ArrowLeft className="size-4" aria-hidden /> {kitchen.data?.name ?? "Kitchen"}
      </Link>
      <h1 className="mb-6 text-3xl font-extrabold">Edit details</h1>
      {kitchen.data ? <KitchenForm kitchen={kitchen.data} /> : <Skeleton className="h-96" />}
    </div>
  );
}

export default function EditKitchenPage() {
  return (
    <OpsShell>
      <Edit />
    </OpsShell>
  );
}
