import { z } from "zod";
const schema = z.object({ url: z.url(), key: z.string().min(20) });
export function supabaseConfig() {
  const result = schema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return result.success ? result.data : null;
}
