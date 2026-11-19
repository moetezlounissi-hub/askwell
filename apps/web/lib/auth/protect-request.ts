import type { ClerkMiddlewareAuth } from "@clerk/nextjs/server";
import type { ApiError } from "@askwell/shared";
import { NextResponse, type NextRequest } from "next/server";

// The proxy matcher includes only owner API routes under /api.
export async function protectRequest(auth: () => ReturnType<ClerkMiddlewareAuth>, request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    const session = await auth();
    if (!session.isAuthenticated) {
      return session.redirectToSignIn();
    }
    return;
  }

  if (pathname.startsWith("/api/") && !(await auth()).isAuthenticated) {
    return NextResponse.json<ApiError>(
      { error: { code: "unauthenticated", message: "Sign in to continue." } },
      { status: 401 },
    );
  }
}
