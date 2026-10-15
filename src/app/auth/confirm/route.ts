import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (!token && !type)
    return NextResponse.redirect(new URL("/auth/session", request.url));
  const client = await createClient();
  if (!client || !token || !["invite", "recovery"].includes(type ?? ""))
    return NextResponse.redirect(new URL("/auth/error", request.url));
  const { error } = await client.auth.verifyOtp({
    token_hash: token,
    type: type as "invite" | "recovery",
  });
  return NextResponse.redirect(
    new URL(error ? "/auth/error" : "/auth/set-password", request.url),
  );
}
