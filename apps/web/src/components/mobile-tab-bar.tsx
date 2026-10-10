"use client";

import { Home, type LucideIcon, Package, Search, ShoppingBag, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCartCount } from "@/lib/cart";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";

/**
 * Shopping pages get a bottom tab bar on phones. Checkout keeps its own bottom action, and the
 * kitchen portal and ops console have their own navigation.
 */
export function showsTabBar(path: string): boolean {
  return !/^\/(checkout|ops|vendor|login)(\/|$)/.test(path);
}

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

export function MobileTabBar() {
  const path = usePathname();
  const count = useCartCount();
  const { user } = useSession();
  if (!showsTabBar(path)) return null;
  const tabs: Tab[] = [
    { href: "/", label: "Home", icon: Home, match: (p) => p === "/" },
    {
      href: "/search",
      label: "Browse",
      icon: Search,
      match: (p) => /^\/(search|from|kitchens|delicacy|send)(\/|$)/.test(p),
    },
    { href: "/orders", label: "Orders", icon: Package, match: (p) => p.startsWith("/orders") },
    { href: "/cart", label: "Cart", icon: ShoppingBag, match: (p) => p === "/cart" },
    {
      href: user ? "/account" : "/login",
      label: user ? "Account" : "Sign in",
      icon: UserRound,
      match: (p) => p.startsWith("/account"),
    },
  ];
  return (
    <>
      {/* Keeps the footer's last lines clear of the bar. */}
      <div aria-hidden className="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden" />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.08)] md:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {tabs.map((t) => {
            const active = t.match(path);
            const isCart = t.href === "/cart";
            return (
              <li key={t.label}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={isCart ? `Cart, ${count} item${count === 1 ? "" : "s"}` : undefined}
                  className={cn(
                    "relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors duration-150",
                    active ? "text-jaggery" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-5 top-0 h-0.5 rounded-b-full transition-colors",
                      active ? "bg-jaggery" : "bg-transparent",
                    )}
                  />
                  <span className="relative">
                    <t.icon
                      className="size-[22px]"
                      strokeWidth={active ? 2.25 : 1.75}
                      aria-hidden
                    />
                    {isCart && count > 0 && (
                      <span className="tabular absolute -right-2.5 -top-1.5 flex min-w-[18px] items-center justify-center rounded-pill bg-jaggery px-1 text-[10px] font-bold leading-[18px] text-on-jaggery">
                        {count}
                      </span>
                    )}
                  </span>
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
