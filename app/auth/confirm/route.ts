import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function sanitizeNextPath(value: string | null): string {
  if (!value) return "/reset-password";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) {
    return "/reset-password";
  }
  return value;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));

  if (!code) {
    const url = new URL("/reset-password", request.url);
    url.searchParams.set("error", "missing_recovery_code");
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const url = new URL("/reset-password", request.url);
    url.searchParams.set("error", "invalid_or_expired_recovery_link");
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL(next, request.url));
}
