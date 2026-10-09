"use client";

import { useMe } from "@food-del/api-client/react";
import type { Role } from "@food-del/domain/contracts";
import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { RequireSession } from "./require-session";
import { EmptyState, Skeleton } from "./ui/primitives";

function Gate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const me = useMe();
  if (me.isLoading)
    return (
      <div className="container-page py-10">
        <Skeleton className="h-64" />
      </div>
    );
  if (!me.data?.roles.some((r) => roles.includes(r))) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={<ShieldAlert className="size-10" />}
          title="Not available for this account"
          body="Sign in with a kitchen or operations account to use this page."
        />
      </div>
    );
  }
  return <>{children}</>;
}

export function RoleGate({
  roles,
  children,
  title,
}: {
  roles: Role[];
  children: ReactNode;
  title: string;
}) {
  return (
    <RequireSession title={title}>
      <Gate roles={roles}>{children}</Gate>
    </RequireSession>
  );
}

export const KITCHEN_ROLES: Role[] = ["VENDOR_OWNER", "VENDOR_STAFF", "OPS", "ADMIN"];
export const OPS_ROLES: Role[] = ["OPS", "ADMIN"];
