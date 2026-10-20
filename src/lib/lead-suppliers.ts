import type { SupabaseClient } from "@supabase/supabase-js";
import { checkDatabase } from "./live-data";
export type LeadSupplierOption = {
  id: string;
  name: string;
  brand: string | null;
};
export async function leadSupplierOptions(
  client: SupabaseClient,
): Promise<LeadSupplierOption[]> {
  const options: LeadSupplierOption[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await client
      .rpc("list_lead_suppliers")
      .range(offset, offset + 499);
    checkDatabase(result.error);
    options.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return options;
  }
}
