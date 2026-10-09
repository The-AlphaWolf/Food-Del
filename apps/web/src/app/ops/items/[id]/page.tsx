"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ItemStatusBadge } from "@/components/ops/common";
import { ItemForm } from "@/components/ops/item-form";
import { OpsShell } from "@/components/ops-shell";
import { useToast } from "@/components/toast";
import { Button, ButtonLink, EmptyState, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";

function EditItem() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const item = useQuery({ queryKey: ["ops-item", id], queryFn: () => api.adminItem(id) });
  const status = useMutation({
    mutationFn: (to: "ACTIVE" | "PAUSED" | "ARCHIVED") => api.setItemStatus(id, { status: to }),
    onSuccess: (saved) => {
      qc.setQueryData(["ops-item", id], saved);
      void qc.invalidateQueries({ queryKey: ["ops-kitchen", saved.vendorId] });
      toast(
        "success",
        saved.status === "ACTIVE"
          ? "On sale."
          : saved.status === "PAUSED"
            ? "Paused."
            : "Archived.",
      );
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  const i = item.data;
  if (item.isError) {
    return (
      <EmptyState
        title="Delicacy not found"
        action={<ButtonLink href="/ops/kitchens">Kitchens</ButtonLink>}
      />
    );
  }
  if (!i) return <Skeleton className="h-96" />;
  return (
    <>
      <Link
        href={`/ops/kitchens/${i.vendorId}`}
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-jaggery"
      >
        <ArrowLeft className="size-4" aria-hidden /> Kitchen
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold">{i.name}</h1>
            <ItemStatusBadge status={i.status} />
          </div>
          {i.status === "ACTIVE" && (
            <Link
              href={`/delicacy/${i.slug}`}
              className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-jaggery hover:underline"
            >
              View on the storefront <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {i.status === "ACTIVE" ? (
            <Button
              variant="secondary"
              loading={status.isPending}
              onClick={() => status.mutate("PAUSED")}
            >
              Pause
            </Button>
          ) : (
            <Button loading={status.isPending} onClick={() => status.mutate("ACTIVE")}>
              Put on sale
            </Button>
          )}
          {i.status !== "ARCHIVED" && (
            <Button variant="ghost" onClick={() => status.mutate("ARCHIVED")}>
              Archive
            </Button>
          )}
        </div>
      </div>
      <ItemForm key={i.id} kitchenId={i.vendorId} item={i} />
    </>
  );
}

export default function ItemPage() {
  return (
    <OpsShell>
      <EditItem />
    </OpsShell>
  );
}
