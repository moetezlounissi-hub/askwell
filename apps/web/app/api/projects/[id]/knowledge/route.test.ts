import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), owned: vi.fn(), ownerClient: vi.fn(), serviceClient: vi.fn(),
  rpc: vi.fn(), reserve: vi.fn(), process: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("../../../../../lib/supabase/get-owned-project", () => ({ getOwnedProject: mocks.owned }));
vi.mock("../../../../../lib/supabase/owner", () => ({ createOwnerClient: mocks.ownerClient }));
vi.mock("../../../../../lib/supabase/service", () => ({ createServiceClient: mocks.serviceClient }));
vi.mock("../../../../../lib/knowledge/processing/process", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../../../lib/knowledge/processing/process")>(),
  processKnowledge: mocks.process,
}));
vi.mock("server-only", () => ({}));

const id = "fd854fac-5531-435f-868d-a2e91734fd95";
const sourceId = "f10d6e79-f23a-4cc1-8c19-3ae02d7cd52a";
const body = { title: "Guide", text: "Support closes at six." };

function post(input: unknown = body) {
  return POST(new Request("http://localhost/knowledge", { method: "POST", body: JSON.stringify(input) }),
    { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: "owner" });
  mocks.owned.mockResolvedValue({ project: { id }, error: null });
  mocks.ownerClient.mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { plan: "pro" } }) }) }) }),
  });
  mocks.serviceClient.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockReturnValue({ single: mocks.reserve });
  mocks.reserve.mockResolvedValue({ data: { source_id: sourceId } });
});
afterEach(() => vi.resetAllMocks());

it("uses the owner's plan to reserve pasted text and returns its final status", async () => {
  mocks.process.mockImplementation(async (_client, projectId, sourceId, loadText: () => Promise<string>) => {
    expect(await loadText()).toBe(body.text);
    return { id: sourceId, project_id: projectId, title: body.title, type: "text", status: "ready", storage_key: null };
  });
  const response = await post();
  expect(response.status).toBe(201);
  expect(mocks.rpc).toHaveBeenCalledWith("reserve_knowledge_source", {
    p_project_id: id, p_owner_id: "owner", p_title: body.title, p_type: "text", p_source_limit: 25,
  });
  expect(mocks.owned).toHaveBeenCalledBefore(mocks.serviceClient);
  expect(await response.json()).toMatchObject({ source: { id: sourceId, projectId: id, status: "ready" } });
});

it("rejects unauthenticated, invalid and foreign requests before a privileged call", async () => {
  mocks.auth.mockResolvedValueOnce({ userId: null });
  expect((await post()).status).toBe(401);
  expect((await post({ ...body, text: "   " })).status).toBe(400);
  mocks.owned.mockResolvedValueOnce({ error: new Response(null, { status: 404 }) });
  expect((await post()).status).toBe(404);
  expect(mocks.serviceClient).not.toHaveBeenCalled();
});

it("rejects a full project without processing text", async () => {
  mocks.reserve.mockResolvedValue({ error: { code: "PT409" } });
  const response = await post();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "limit_exceeded" } });
  expect(mocks.process).not.toHaveBeenCalled();
});
