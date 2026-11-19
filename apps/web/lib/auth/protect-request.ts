import type { ClerkMiddlewareAuth } from "@clerk/nextjs/server";
import type { ApiError } from "@askwell/shared";
import { NextResponse, type NextRequest } from "next/server";

// The proxy matcher includes only owner API routes under /api.
export async function protectRequest(auth: ClerkMiddlewareAuth, request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    await auth.protect();
  }

  if (pathname.startsWith("/api/") && !(await auth()).isAuthenticated) {
    return NextResponse.json<ApiError>(
      { error: { code: "unauthenticated", message: "Sign in to continue." } },
      { status: 401 },
    );
  }
}
