import { afterEach, expect, it, vi } from "vitest";
import { DELETE } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createOwnerClient: vi.fn(),
  createServiceClient: vi.fn(),
  rpc: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("../../../../lib/supabase/owner", () => ({ createOwnerClient: mocks.createOwnerClient }));
vi.mock("../../../../lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock("server-only", () => ({}));

const id = "fd854fac-5531-435f-868d-a2e91734fd95";

function removeSource(body?: string) {
  return DELETE(new Request("http://localhost/knowledge", {
    method: "DELETE", body,
  }), { params: Promise.resolve({ id }) });
}

function mockOwnerRead(data: { id: string } | null) {
  mocks.auth.mockResolvedValue({ userId: "owner" });
  mocks.createOwnerClient.mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data }) }) }) }),
  });
  mocks.createServiceClient.mockReturnValue({
    rpc: mocks.rpc, storage: { from: () => ({ remove: mocks.remove }) },
  });
}

afterEach(() => vi.resetAllMocks());

it("checks owner visibility and rejects a body before accessing the service", async () => {
  mockOwnerRead(null);
  expect((await removeSource("null")).status).toBe(400);
  expect((await removeSource()).status).toBe(404);
  expect(mocks.createServiceClient).not.toHaveBeenCalled();
});

it("deletes the source before removing the object and acknowledges successful removal", async () => {
  mockOwnerRead({ id });
  mocks.rpc.mockReturnValueOnce({ maybeSingle: async () => ({ data: { storage_key: "project/file" } }) });
  mocks.rpc.mockResolvedValueOnce({});
  mocks.remove.mockResolvedValue({});

  expect((await removeSource()).status).toBe(204);
  expect(mocks.rpc).toHaveBeenNthCalledWith(1, "delete_knowledge_source", { p_owner_id: "owner", p_source_id: id });
  expect(mocks.remove).toHaveBeenCalledWith(["project/file"]);
  expect(mocks.rpc).toHaveBeenNthCalledWith(2, "complete_knowledge_cleanup", { p_storage_key: "project/file" });
});

it("leaves cleanup pending if object removal fails after deletion", async () => {
  mockOwnerRead({ id });
  mocks.rpc.mockReturnValueOnce({ maybeSingle: async () => ({ data: { storage_key: "project/file" } }) });
  mocks.remove.mockResolvedValue({ error: new Error("Storage unavailable") });

  expect((await removeSource()).status).toBe(204);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
