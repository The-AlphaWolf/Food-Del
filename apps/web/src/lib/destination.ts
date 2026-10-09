"use client";

import { useRouter } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";

/** Cookie the server reads to render delivery estimates for the shopper's pincode. */
export const PINCODE_COOKIE = "fd_pin";
const listeners = new Set<() => void>();

function read(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)fd_pin=(\d{6})/);
  return m?.[1] ?? null;
}

export function setPincodeCookie(pincode: string | null) {
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is missing in Firefox and older Safari.
  document.cookie = pincode
    ? `${PINCODE_COOKIE}=${pincode}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`
    : `${PINCODE_COOKIE}=; path=/; max-age=0`;
  for (const l of listeners) l();
}

/** The shopper's delivery pincode, shared by every component and the server. */
export function useDestination() {
  const router = useRouter();
  const pincode = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => null,
  );
  const setPincode = useCallback(
    (next: string | null) => {
      setPincodeCookie(next);
      router.refresh();
    },
    [router],
  );
  return { pincode, setPincode };
}
