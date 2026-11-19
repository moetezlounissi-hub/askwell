import type { Tables } from "@askwell/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOwnedProject } from "./get-owned-project";
import { createOwnerClient } from "./owner";
import { createServiceClient } from "./service";

const { clerkAuth } = vi.hoisted(() => ({ clerkAuth: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: clerkAuth }));
vi.mock("server-only", () => ({}));

const url = "https://example.supabase.co";
const publishableKey = "sb_publishable_test";
const serviceKey = "sb_secret_test";
const fetchMock = vi.fn<typeof fetch>();
const project: Tables<"projects"> = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Owner project",
  owner_id: "user_owner",
  public_key: "pk_example",
  messages_used: 0,
  period_start: "2026-11-01T00:00:00Z",
  created_at: "2026-11-01T00:00:00Z",
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publishableKey);
  vi.stubEnv("SUPABASE_SECRET_KEY", serviceKey);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

function requestHeaders(index = 0) {
  return new Headers(fetchMock.mock.calls[index]?.[1]?.headers);
}

describe("Supabase clients", () => {
  it.each(["http://example.supabase.co", "http://localhost:54321", "invalid", undefined])(
    "rejects unconfigured or insecure endpoints (%s) before obtaining credentials",
    (endpoint) => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", endpoint);
      expect(createOwnerClient).toThrow("NEXT_PUBLIC_SUPABASE_URL must be an HTTPS URL.");
      expect(createServiceClient).toThrow("NEXT_PUBLIC_SUPABASE_URL must be an HTTPS URL.");
      expect(clerkAuth).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("forwards each request's Clerk session token through accessToken", async () => {
    const firstToken = vi.fn().mockResolvedValue("owner-session-one");
    const secondToken = vi.fn().mockResolvedValue("owner-session-two");
    fetchMock.mockImplementation(async () => Response.json([]));

    clerkAuth.mockResolvedValue({ getToken: firstToken });
    await createOwnerClient().from("projects").select("id");
    clerkAuth.mockResolvedValue({ getToken: secondToken });
    await createOwnerClient().from("projects").select("id");

    expect(firstToken).toHaveBeenCalledWith();
    expect(secondToken).toHaveBeenCalledWith();
    expect(requestHeaders().get("authorization")).toBe("Bearer owner-session-one");
    expect(requestHeaders(1).get("authorization")).toBe("Bearer owner-session-two");
    for (const [, options] of fetchMock.mock.calls) {
      expect(new Headers(options?.headers).get("apikey")).toBe(publishableKey);
      expect(options?.cache).toBe("no-store");
    }
  });

  it("uses the service key independently of Clerk and the publishable key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined);
    fetchMock.mockResolvedValueOnce(Response.json([]));

    await createServiceClient().from("projects").select("id");

    expect(requestHeaders().get("apikey")).toBe(serviceKey);
    expect(clerkAuth).not.toHaveBeenCalled();
  });

  it("fails with a configuration error when the service key is absent", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
    expect(() => createServiceClient()).toThrow("SUPABASE_SECRET_KEY");
  });
});

describe("getOwnedProject", () => {
  beforeEach(() => {
    clerkAuth.mockResolvedValue({ getToken: vi.fn().mockResolvedValue("owner-session") });
  });

  it("returns a typed project from the owner client and filters by project ID", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
    fetchMock.mockResolvedValueOnce(Response.json([project]));

    await expect(getOwnedProject(project.id)).resolves.toEqual({ project, error: null });

    const request = new URL(String(fetchMock.mock.calls[0][0]));
    expect(request.origin).toBe(url);
    expect(request.pathname).toBe("/rest/v1/projects");
    expect(request.searchParams.get("id")).toBe(`eq.${project.id}`);
    expect(request.searchParams.has("owner_id")).toBe(false);
    expect(requestHeaders().get("apikey")).toBe(publishableKey);
    expect(requestHeaders().get("authorization")).toBe("Bearer owner-session");
  });

  it.each(["missing", "foreign"])("returns the same opaque 404 for a %s project", async () => {
    // RLS returns an empty result in both cases.
    fetchMock.mockResolvedValueOnce(Response.json([]));

    const { project: result, error } = await getOwnedProject(project.id);

    expect(result).toBeNull();
    expect(error?.status).toBe(404);
    await expect(error?.json()).resolves.toEqual({
      error: { code: "not_found", message: "Project not found." },
    });
  });

  it("rejects a malformed ID without querying the database", async () => {
    const result = await getOwnedProject("invalid");
    expect(result.error?.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("omits database diagnostics from unexpected upstream errors", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(
      { code: "XX000", message: "internal database detail" },
      { status: 500 },
    ));

    const result = await getOwnedProject(project.id);

    expect(result.error?.status).toBe(500);
    await expect(result.error?.json()).resolves.toEqual({
      error: { code: "internal_error", message: "Could not load project." },
    });
  });
});
