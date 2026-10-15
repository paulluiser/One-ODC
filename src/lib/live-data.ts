import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
export function checkDatabase(error: PostgrestError | null) {
  if (error)
    throw new Error(
      "Workspace records could not be loaded. Check the database configuration or try again.",
    );
}
