import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapAccount } from "./bootstrap-account";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: { protect: vi.fn() } }));

const protect = vi.mocked(auth.protect);
const upsert = vi.fn();
const from = vi.fn(() => ({ upsert }));
const createServiceClient = vi.fn(() => ({ from }));

beforeEach(() => {
  vi.clearAllMocks();
  protect.mockImplementation(async () => {
    const session = { userId: "user_verified" };
    return session as Awaited<ReturnType<typeof auth.protect>>;
  });
  upsert.mockResolvedValue({ error: null });
});

describe("bootstrapAccount", () => {
  it("uses only the verified Clerk user and ignores conflicts on the account key", async () => {
    await bootstrapAccount(createServiceClient);

    expect(from).toHaveBeenCalledExactlyOnceWith("accounts");
    expect(upsert).toHaveBeenCalledExactlyOnceWith(
      { clerk_user_id: "user_verified", plan: "free" },
      { onConflict: "clerk_user_id", ignoreDuplicates: true },
    );
  });

  it("leaves the service client unopened when Clerk rejects the request", async () => {
    protect.mockRejectedValueOnce(new Error("Sign-in required"));

    await expect(bootstrapAccount(createServiceClient)).rejects.toThrow("Sign-in required");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("surfaces write failures so the dashboard can retry", async () => {
    const error = { message: "Service unavailable" };
    upsert.mockResolvedValueOnce({ error });

    await expect(bootstrapAccount(createServiceClient)).rejects.toMatchObject({ cause: error });
    await expect(bootstrapAccount(createServiceClient)).resolves.toBeUndefined();
  });
});
