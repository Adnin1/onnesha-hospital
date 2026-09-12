import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 1. Static assets and metadata skip
  if (
    path.startsWith("/_next") ||
    path.startsWith("/api/health") ||
    path.includes(".")
  ) {
    return NextResponse.next();
  }

  // 2. Update Supabase Session
  const sessionResponse = await updateSession(request);

  // 3. Route Protection Rule: Hospital portal (/app/*) requires authentication
  const isProtectedRoute = path.startsWith("/app");
  if (isProtectedRoute) {
    const supabaseToken =
      request.cookies.get("sb-access-token")?.value ||
      request.cookies.get("supabase-auth-token")?.value ||
      request.cookies.get("sb-iuhtzahuszdkdarhxobx-auth-token")?.value;

    if (!supabaseToken) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return sessionResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
