import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/env";
export function passwordRecoveryUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return null;
  try {
    const url = new URL(appUrl);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      return null;
    return new URL("/auth/confirm", url).toString();
  } catch {
    return null;
  }
}
export function createRecoveryClient() {
  const config = supabaseConfig();
  if (!config) return null;
  // Recovery emails can be opened on another device or by an admin's recipient.
  // Do not bind them to the requesting browser's PKCE verifier/session.
  return createClient(config.url, config.key, {
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
