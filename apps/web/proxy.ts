import { clerkMiddleware } from "@clerk/nextjs/server";
import { protectRequest } from "./lib/auth/protect-request";

export default clerkMiddleware(protectRequest, { signInUrl: "/sign-in" });

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/projects/:path*",
    "/api/knowledge/:path*",
    "/api/conversations/:path*",
    "/sign-in/:path*",
    "/sign-up/:path*",
    "/__clerk/:path*",
  ],
};
