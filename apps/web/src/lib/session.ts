"use client";

import type { Me } from "@food-del/domain/contracts";
import { useSyncExternalStore } from "react";

/**
 * Session token for the API. In development it comes from the dev OTP login; with Supabase it is
 * the Supabase access token. The same token is what the mobile app sends.
 */
const KEY = "fd_token";
const USER_KEY = "fd_user";
const listeners = new Set<() => void>();

export interface SessionState {
  token: string | null;
  user: Me | null;
}

let state: SessionState = { token: null, user: null };
let loaded = false;

function load(): SessionState {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      const token = window.localStorage.getItem(KEY);
      const user = window.localStorage.getItem(USER_KEY);
      state = { token, user: user ? (JSON.parse(user) as Me) : null };
    } catch {
      state = { token: null, user: null };
    }
  }
  return state;
}

export const session = {
  get: () => load(),
  token: () => load().token,
  set(token: string, user: Me) {
    state = { token, user };
    try {
      window.localStorage.setItem(KEY, token);
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // ignore
    }
    for (const l of listeners) l();
  },
  setUser(user: Me) {
    if (!state.token) return;
    session.set(state.token, user);
  },
  clear() {
    state = { token: null, user: null };
    try {
      window.localStorage.removeItem(KEY);
      window.localStorage.removeItem(USER_KEY);
    } catch {
      // ignore
    }
    for (const l of listeners) l();
  },
};

const SERVER: SessionState = { token: null, user: null };

export function useSession(): SessionState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => load(),
    () => SERVER,
  );
}
