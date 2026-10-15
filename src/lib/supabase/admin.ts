import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/env";
export function createAdminClient() {
  const config = supabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!config || !secret) return null;
  return createClient(config.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
