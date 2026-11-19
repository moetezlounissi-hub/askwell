import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./page";

const { protect, createServiceClient, createOwnerClient, upsert, single } =
  vi.hoisted(() => {
    const upsert = vi.fn();
    const single = vi.fn();

    return {
      protect: vi.fn(),
      createServiceClient: vi.fn(() => ({
        from: vi.fn(() => ({ upsert })),
      })),
      createOwnerClient: vi.fn(() => ({
        from: vi.fn(() => ({ select: vi.fn(() => ({ single })) })),
      })),
      upsert,
      single,
    };
  });

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: { protect } }));
vi.mock("../../lib/supabase/service", () => ({ createServiceClient }));
vi.mock("../../lib/supabase/owner", () => ({ createOwnerClient }));

beforeEach(() => {
  vi.clearAllMocks();
  protect.mockResolvedValue({ userId: "user_verified" });
  upsert.mockResolvedValue({ error: null });
  single.mockResolvedValue({ data: { plan: "free" }, error: null });
});

describe("Dashboard", () => {
  it("bootstraps the verified account before reading with the owner's client", async () => {
    const request = { searchParams: Promise.resolve({ userId: "user_forged" }) };
    await Reflect.apply(Dashboard, undefined, [request]);

    expect(upsert).toHaveBeenCalledExactlyOnceWith(
      { clerk_user_id: "user_verified", plan: "free" },
      { onConflict: "clerk_user_id", ignoreDuplicates: true },
    );
    expect(upsert).toHaveBeenCalledBefore(createOwnerClient);
    expect(single).toHaveBeenCalledOnce();
  });

  it("does not open either database client when Clerk rejects entry", async () => {
    protect.mockRejectedValueOnce(new Error("Sign-in required"));

    await expect(Dashboard()).rejects.toThrow("Sign-in required");
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(createOwnerClient).not.toHaveBeenCalled();
  });

  it("surfaces owner read errors through the dashboard error boundary", async () => {
    const error = { message: "Account unavailable" };
    single.mockResolvedValueOnce({ data: null, error });

    await expect(Dashboard()).rejects.toMatchObject({ cause: error });
  });
});
