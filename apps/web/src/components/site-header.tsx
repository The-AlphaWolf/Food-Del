"use client";

import { ShoppingBag, UserRound } from "lucide-react";
import Link from "next/link";
import { useCartCount } from "@/lib/cart";
import { useSession } from "@/lib/session";
import { PincodeButton } from "./pincode-picker";

export function SiteHeader() {
  const count = useCartCount();
  const { user } = useSession();
  const isVendor = user?.roles.some((r) => r === "VENDOR_OWNER" || r === "VENDOR_STAFF");
  const isOps = user?.roles.some((r) => r === "OPS" || r === "ADMIN");
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur-[2px]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="container-page flex h-16 items-center gap-3">
        <Link href="/" className="mr-auto flex items-baseline gap-1.5" aria-label="Food-Del home">
          <span className="font-display text-2xl font-extrabold tracking-tight text-jaggery">
            Food-Del
          </span>
          <span className="hidden text-xs font-semibold text-ink-muted sm:inline">
            India's delicacies, delivered
          </span>
        </Link>
        <nav
          aria-label="Primary"
          className="hidden items-center gap-1 text-sm font-semibold md:flex"
        >
          <Link href="/search" className="rounded-md px-3 py-2 hover:bg-paper-deep">
            Browse
          </Link>
          {isVendor && (
            <Link href="/vendor" className="rounded-md px-3 py-2 hover:bg-paper-deep">
              Kitchen
            </Link>
          )}
          {isOps && (
            <Link href="/ops" className="rounded-md px-3 py-2 hover:bg-paper-deep">
              Ops
            </Link>
          )}
        </nav>
        <PincodeButton />
        <Link
          href={user ? "/account" : "/login"}
          className="flex size-11 items-center justify-center rounded-md hover:bg-paper-deep"
          aria-label={user ? "Your account" : "Sign in"}
        >
          <UserRound className="size-5" />
        </Link>
        <Link
          href="/cart"
          className="relative flex size-11 items-center justify-center rounded-md hover:bg-paper-deep"
          aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
        >
          <ShoppingBag className="size-5" />
          {count > 0 && (
            <span className="tabular absolute right-1 top-1 flex min-w-5 items-center justify-center rounded-pill bg-jaggery px-1 text-[11px] font-bold text-white">
              {count}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
