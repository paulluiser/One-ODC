"use client";
import { useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/env";
import { StartupState } from "./startup-state";

// Supabase's default email uses a verified Auth URL, then returns a URL fragment.
// Custom SMTP can instead use our server-side token-hash confirmation route.
export function InvitationLanding({
  fallback = "/login",
  modern = false,
}: {
  fallback?: string;
  modern?: boolean;
}) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const access_token = fragment.get("access_token");
    const refresh_token = fragment.get("refresh_token");
    const type = fragment.get("type");
    window.history.replaceState(null, "", window.location.pathname);
    if (!fragment.size) {
      window.location.replace(fallback);
      return;
    }
    const config = supabaseConfig();
    if (
      !config ||
      !access_token ||
      !refresh_token ||
      !["invite", "recovery"].includes(type ?? "")
    ) {
      window.location.replace("/auth/error");
      return;
    }
    const client = createBrowserClient(config.url, config.key, {
      auth: { detectSessionInUrl: false },
    });
    void (async () => {
      try {
        const session = await client.auth.setSession({
          access_token,
          refresh_token,
        });
        if (session.error) throw session.error;
        const identity = await client.auth.getUser();
        if (identity.error || !identity.data.user)
          throw new Error("Invalid invitation");
        window.location.replace("/auth/set-password");
      } catch {
        await client.auth.signOut({ scope: "local" });
        window.location.replace("/auth/error");
      }
    })();
  }, [fallback]);
  return (
    <StartupState
      modern={modern}
      message={
        fallback === "/auth/error"
          ? "Checking your invitation securely…"
          : modern
            ? "Preparing your workspace"
            : "Opening your workspace…"
      }
    />
  );
}
