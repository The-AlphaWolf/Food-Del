"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { OPS_ROLES, RoleGate } from "./role-gate";

const TABS = [
  { href: "/ops", label: "Overview" },
  { href: "/ops/parcels", label: "Parcels" },
  { href: "/ops/claims", label: "Claims" },
  { href: "/ops/kitchens", label: "Kitchens" },
  { href: "/ops/routes", label: "Routes" },
  { href: "/ops/cities", label: "Cities" },
  { href: "/ops/calendar", label: "Calendar" },
];

/** The tab a page belongs to: exact for the overview, by section for everything else. */
const isCurrent = (path: string, href: string) =>
  href === "/ops" ? path === href : path === href || path.startsWith(`${href}/`);

export function OpsShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <RoleGate roles={OPS_ROLES} title="Operations sign-in">
      <div className="border-b border-line bg-card">
        <nav aria-label="Operations" className="container-page flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={isCurrent(path, t.href) ? "page" : undefined}
              className={cn(
                "flex min-h-12 items-center whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors",
                isCurrent(path, t.href)
                  ? "border-jaggery text-jaggery"
                  : "border-transparent text-ink-soft hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="container-page py-8">{children}</div>
    </RoleGate>
  );
}
