"use client";

import { normaliseIndianMobile } from "@food-del/domain";
import type { Me } from "@food-del/domain/contracts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AUTH_MODE, api } from "./api";
import { session } from "./session";

let supabase: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase is not configured");
    supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
    supabase.auth.onAuthStateChange((_event, s) => {
      if (!s) session.clear();
      else if (session.get().user) session.set(s.access_token, session.get().user!);
    });
  }
  return supabase;
}

/** Step 1: send a one-time code to the phone. Returns the dev code when running locally. */
export async function startPhoneLogin(phoneRaw: string): Promise<{ devCode?: string }> {
  const phone = normaliseIndianMobile(phoneRaw);
  if (!phone) throw new Error("Enter a 10-digit Indian mobile number.");
  if (AUTH_MODE === "supabase") {
    const { error } = await sb().auth.signInWithOtp({ phone });
    if (error) throw new Error(error.message);
    return {};
  }
  const r = await api.requestOtp(phone);
  return { devCode: r.devCode };
}

/** Step 2: verify the code and store the session (same token the mobile app uses). */
export async function finishPhoneLogin(phoneRaw: string, code: string): Promise<Me> {
  const phone = normaliseIndianMobile(phoneRaw);
  if (!phone) throw new Error("Enter a 10-digit Indian mobile number.");
  if (AUTH_MODE === "supabase") {
    const { data, error } = await sb().auth.verifyOtp({ phone, token: code, type: "sms" });
    if (error || !data.session) throw new Error(error?.message ?? "That code didn't work.");
    session.set(data.session.access_token, {
      id: data.session.user.id,
      phone,
      fullName: null,
      email: null,
      roles: ["CUSTOMER"],
      vendors: [],
    });
    const me = await api.me();
    session.setUser(me);
    return me;
  }
  const s = await api.verifyOtp(phone, code);
  session.set(s.token, s.user);
  return s.user;
}

export async function logout(): Promise<void> {
  try {
    if (AUTH_MODE === "supabase") await sb().auth.signOut();
    await api.logout();
  } finally {
    session.clear();
  }
}
