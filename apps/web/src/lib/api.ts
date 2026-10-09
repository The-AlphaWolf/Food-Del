"use client";

import { createApiClient } from "@food-del/api-client";
import { session } from "./session";

/** The browser's API client: same contract and client as the mobile app. */
export const api = createApiClient({
  baseUrl: "/api",
  getToken: () => session.token(),
  clientVersion: "web",
  onUnauthorized: () => session.clear(),
});

export const DEV_TOOLS = process.env.NEXT_PUBLIC_DEV_TOOLS !== "0";
export const AUTH_MODE = (process.env.NEXT_PUBLIC_AUTH_MODE ?? "dev") as "dev" | "supabase";
