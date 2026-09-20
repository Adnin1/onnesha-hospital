import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 1. Skip static assets, health API, images, and public files
  if (
    path.startsWith("/_next") ||
    path.startsWith("/api/health") ||
    path.includes(".")
  ) {
    return NextResponse.next();
  }

  // 2. Refresh Supabase session & fetch authenticated user via @supabase/ssr
  const { response, user } = await updateSession(request);

  // 3. Define protected route prefix (/app/*)
  const isProtectedRoute = path.startsWith("/app");

  // 4. Protected route enforcement: Require server-authenticated user (NO hardcoded cookie name checks)
  if (isProtectedRoute && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 5. If already authenticated and accessing /login, redirect to /app/dashboard
  if (path === "/login" && user) {
    return NextResponse.redirect(new URL("/app/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
