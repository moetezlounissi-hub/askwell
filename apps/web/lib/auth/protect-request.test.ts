import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { config } from "../../proxy";
import { protectRequest } from "./protect-request";

const origin = "https://askwell.example";

function mockAuth(isAuthenticated: boolean) {
  const protect = vi.fn();
  if (!isAuthenticated) {
    protect.mockRejectedValue(new Error("Clerk sign-in redirect"));
  }

  return Object.assign(vi.fn().mockResolvedValue({ isAuthenticated }), { protect });
}

describe("Clerk proxy", () => {
  it.each(["/dashboard", "/dashboard/projects", "/api/projects", "/api/projects/123/knowledge", "/api/knowledge/123", "/api/conversations/123", "/sign-in", "/sign-up/verify-email"])(
    "matches %s",
    (url) => expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true),
  );

  it.each(["/", "/api/widget/config", "/api/widget/chat", "/api/clerk/webhook", "/api/posthog-config", "/api/projects-public", "/dashboard-preview"])(
    "leaves %s public",
    (url) => expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false),
  );

  it("delegates signed-out dashboard redirects to Clerk", async () => {
    const auth = mockAuth(false);

    await expect(protectRequest(auth, new NextRequest(origin + "/dashboard")))
      .rejects.toThrow("Clerk sign-in redirect");
    expect(auth.protect).toHaveBeenCalledOnce();
  });

  it("returns a JSON 401 for an unauthenticated owner API request", async () => {
    const response = await protectRequest(mockAuth(false), new NextRequest(origin + "/api/projects"));

    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({
      error: { code: "unauthenticated", message: "Sign in to continue." },
    });
  });

  it.each(["/dashboard", "/api/projects"])("allows authenticated requests to %s", async (path) => {
    await expect(protectRequest(mockAuth(true), new NextRequest(origin + path)))
      .resolves.toBeUndefined();
  });
});
