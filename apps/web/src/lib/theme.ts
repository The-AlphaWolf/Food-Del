"use client";

import { colors, darkColors } from "@food-del/design-tokens";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { DARK_QUERY, THEME_STORAGE_KEY } from "./theme-script";

/** What the shopper chose. "system" follows the device's light/dark setting. */
export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const KEY = THEME_STORAGE_KEY;

const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref !== "system") return pref;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** Switch without every colour transition animating at once. */
function apply(theme: ResolvedTheme) {
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  root.dataset.switchingTheme = "";
  root.dataset.theme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = theme === "dark" ? darkColors.paper : colors.paper;
  }
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      delete root.dataset.switchingTheme;
    }),
  );
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const media = window.matchMedia(DARK_QUERY);
  const onSystem = () => {
    if (readPreference() === "system") apply(resolve("system"));
    cb();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      apply(resolve(readPreference()));
      cb();
    }
  };
  media.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    media.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
  };
}

/** The theme preference and the theme actually showing, shared by every control. */
export function useTheme() {
  const preference = useSyncExternalStore(subscribe, readPreference, () => "system" as const);
  const resolved = useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light") as ResolvedTheme,
    () => "light" as const,
  );
  const setPreference = useCallback((next: ThemePreference) => {
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice lasts until the page closes.
    }
    apply(resolve(next));
    emit();
  }, []);
  // A preference saved in another tab, or the system setting changing, is picked up here.
  useEffect(() => {
    apply(resolve(readPreference()));
  }, []);
  return { preference, resolved, setPreference };
}
