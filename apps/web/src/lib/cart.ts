"use client";

import type { TempClass } from "@food-del/domain";
import { useSyncExternalStore } from "react";

/** What we remember about a cart line for display before the server quotes it. */
export interface CartLine {
  variantId: string;
  quantity: number;
  /** Requested arrival date (gifting); null for earliest. */
  arriveOn: string | null;
  itemSlug: string;
  itemName: string;
  variantLabel: string;
  unitPricePaise: number;
  vendorName: string;
  cityName: string;
  artKey: string | null;
  tempClass: TempClass;
}

const KEY = "fd_cart_v1";
const listeners = new Set<() => void>();
let snapshot: CartLine[] = [];
let loaded = false;

function load(): CartLine[] {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      const raw = window.localStorage.getItem(KEY);
      snapshot = raw ? (JSON.parse(raw) as CartLine[]) : [];
    } catch {
      snapshot = [];
    }
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) {
        loaded = false;
        load();
        emit();
      }
    });
  }
  return snapshot;
}

function emit() {
  for (const l of listeners) l();
}

function save(next: CartLine[]) {
  snapshot = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or storage full: the cart still works for this tab.
  }
  emit();
}

const EMPTY: CartLine[] = [];

export const cart = {
  lines: () => load(),
  add(line: CartLine) {
    const lines = load();
    const i = lines.findIndex(
      (l) => l.variantId === line.variantId && l.arriveOn === line.arriveOn,
    );
    if (i >= 0) {
      const next = [...lines];
      next[i] = { ...next[i]!, quantity: Math.min(20, next[i]!.quantity + line.quantity) };
      save(next);
    } else {
      save([...lines, line]);
    }
  },
  setQuantity(variantId: string, arriveOn: string | null, quantity: number) {
    save(
      load()
        .map((l) => (l.variantId === variantId && l.arriveOn === arriveOn ? { ...l, quantity } : l))
        .filter((l) => l.quantity > 0),
    );
  },
  setArriveOn(variantIds: string[], from: string | null, to: string | null) {
    save(
      load().map((l) =>
        variantIds.includes(l.variantId) && l.arriveOn === from ? { ...l, arriveOn: to } : l,
      ),
    );
  },
  remove(variantId: string, arriveOn: string | null) {
    save(load().filter((l) => !(l.variantId === variantId && l.arriveOn === arriveOn)));
  },
  removeVariants(variantIds: string[]) {
    save(load().filter((l) => !variantIds.includes(l.variantId)));
  },
  clear() {
    save([]);
  },
};

export function useCart(): CartLine[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => load(),
    () => EMPTY,
  );
}

export function useCartCount(): number {
  return useCart().reduce((n, l) => n + l.quantity, 0);
}
