import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getOwnedProject: vi.fn(),
  createOwnerClient: vi.fn(),
  createServiceClient: vi.fn(),
  rpc: vi.fn(),
  sign: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("../../../../../../lib/supabase/get-owned-project", () => ({ getOwnedProject: mocks.getOwnedProject }));
vi.mock("../../../../../../lib/supabase/owner", () => ({ createOwnerClient: mocks.createOwnerClient }));
vi.mock("../../../../../../lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock("server-only", () => ({}));

const id = "fd854fac-5531-435f-868d-a2e91734fd95";
const file = { title: "Guide", fileName: "Guide.pdf", contentType: "application/pdf", sizeBytes: 100 };

function post(body: unknown = file) {
  return POST(new Request("http://localhost/upload-url", {
    method: "POST", body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
}

function mockOwnerReservation() {
  mocks.auth.mockResolvedValue({ userId: "owner" });
  mocks.getOwnedProject.mockResolvedValue({ project: { id }, error: null });
  mocks.createOwnerClient.mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { plan: "pro" } }) }) }) }),
  });
  mocks.createServiceClient.mockReturnValue({
    rpc: mocks.rpc, storage: { from: () => ({ createSignedUploadUrl: mocks.sign }) },
  });
  mocks.rpc.mockReturnValueOnce({ single: async () => ({ data: { source_id: "source" } }) });
}

afterEach(() => vi.resetAllMocks());

it("checks ownership and reserves against the owner's plan before signing without overwrite", async () => {
  mockOwnerReservation();
  mocks.sign.mockResolvedValue({ data: { signedUrl: "https://example.test/signed" } });

  const response = await post();
  expect(response.status).toBe(200);
  const key = mocks.rpc.mock.calls[0][1].p_storage_key;
  expect(key).toMatch(new RegExp(`^${id}/[0-9a-f-]+\\.pdf$`));
  expect(mocks.rpc).toHaveBeenCalledWith("reserve_knowledge_source", {
    p_project_id: id, p_owner_id: "owner", p_title: "Guide", p_type: "pdf",
    p_source_limit: 25, p_storage_key: key,
  });
  expect(mocks.getOwnedProject).toHaveBeenCalledBefore(mocks.rpc);
  expect(mocks.rpc).toHaveBeenCalledBefore(mocks.sign);
  expect(mocks.sign).toHaveBeenCalledWith(key, { upsert: false });
  expect(await response.json()).toEqual({ sourceId: "source", signedUrl: "https://example.test/signed", storageKey: key });
});

it("rejects invalid declarations and foreign projects before calling the service", async () => {
  mocks.auth.mockResolvedValue({ userId: "owner" });
  expect((await post({ ...file, contentType: "text/plain" })).status).toBe(400);
  mocks.getOwnedProject.mockResolvedValue({ error: new Response(null, { status: 404 }) });
  expect((await post()).status).toBe(404);
  expect(mocks.createServiceClient).not.toHaveBeenCalled();
});

it("revokes the reservation when signing fails", async () => {
  mockOwnerReservation();
  mocks.sign.mockResolvedValue({ error: new Error("Storage unavailable") });

  expect((await post()).status).toBe(500);
  expect(mocks.rpc).toHaveBeenLastCalledWith("delete_knowledge_source", {
    p_owner_id: "owner", p_source_id: "source",
  });
});
