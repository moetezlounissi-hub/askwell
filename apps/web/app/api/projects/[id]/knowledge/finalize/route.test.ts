import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), owned: vi.fn(), ownerClient: vi.fn(), serviceClient: vi.fn(),
  rpc: vi.fn(), claim: vi.fn(), existing: vi.fn(), download: vi.fn(),
  remove: vi.fn(), insert: vi.fn(), embed: vi.fn(), update: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("../../../../../../lib/supabase/get-owned-project", () => ({ getOwnedProject: mocks.owned }));
vi.mock("../../../../../../lib/supabase/owner", () => ({ createOwnerClient: mocks.ownerClient }));
vi.mock("../../../../../../lib/supabase/service", () => ({ createServiceClient: mocks.serviceClient }));
vi.mock("../../../../../../lib/knowledge/processing/embed", () => ({ embedKnowledgeChunks: mocks.embed }));
vi.mock("server-only", () => ({}));

const id = "fd854fac-5531-435f-868d-a2e91734fd95";
const sourceId = "f10d6e79-f23a-4cc1-8c19-3ae02d7cd52a";
const key = `${id}/guide.md`;
const row = { id: sourceId, project_id: id, type: "md", title: "Guide", storage_key: key, status: "processing" };

function post(body: unknown = { sourceId }) {
  return POST(new Request("http://localhost/finalize", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: "owner" });
  mocks.owned.mockResolvedValue({ project: { id }, error: null });
  mocks.claim.mockResolvedValue({ data: row });
  mocks.rpc.mockImplementation((name) => name === "claim_knowledge_upload"
    ? { maybeSingle: mocks.claim }
    : Promise.resolve({ error: null }));
  mocks.ownerClient.mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.existing }) }) }) }),
  });
  mocks.serviceClient.mockReturnValue({
    rpc: mocks.rpc,
    storage: { from: () => ({ download: mocks.download, remove: mocks.remove }) },
    from: () => ({
      insert: mocks.insert, update: mocks.update,
      delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  });
  mocks.update.mockImplementation(({ status }) => ({
    eq: () => ({ eq: () => ({ eq: () => ({ select: () => ({
      single: async () => ({ data: { ...row, status } }),
    }) }) }) }),
  }));
  mocks.embed.mockResolvedValue(["[1]"]);
  mocks.insert.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
});
afterEach(() => vi.resetAllMocks());

it("claims the upload, downloads the reserved key, and stores Markdown before reporting ready", async () => {
  mocks.download.mockResolvedValue({ data: new Blob(["# Guide\n\nCall support."]) });
  const response = await post();
  expect(await response.json()).toMatchObject({ source: { status: "ready" } });
  expect(mocks.rpc).toHaveBeenCalledWith("claim_knowledge_upload", {
    p_project_id: id, p_owner_id: "owner", p_source_id: sourceId,
  });
  expect(mocks.owned).toHaveBeenCalledBefore(mocks.rpc);
  expect(mocks.claim).toHaveBeenCalledBefore(mocks.download);
  expect(mocks.download).toHaveBeenCalledWith(key);
  expect(mocks.insert).toHaveBeenCalledWith([{
    project_id: id, source_id: sourceId, content: "# Guide Call support.", embedding: "[1]",
  }]);
});

it("removes a refused PDF and reports a failed source without embedding", async () => {
  const pdfKey = `${id}/guide.pdf`;
  mocks.claim.mockResolvedValue({ data: { ...row, type: "pdf", storage_key: pdfKey } });
  mocks.download.mockResolvedValue({ data: new Blob(["not a PDF"]) });
  const response = await post();
  expect(await response.json()).toMatchObject({ source: { status: "failed" } });
  expect(mocks.remove).toHaveBeenCalledWith([pdfKey]);
  expect(mocks.embed).not.toHaveBeenCalled();
});

it.each(["processing", "ready", "failed"])("returns %s on retry without processing again", async (status) => {
  mocks.claim.mockResolvedValue({ data: null });
  mocks.existing.mockResolvedValue({ data: { ...row, status } });
  expect(await (await post()).json()).toMatchObject({ source: { status } });
  expect(mocks.download).not.toHaveBeenCalled();
});

it("rejects invalid, unauthenticated, and foreign requests before using the service", async () => {
  mocks.auth.mockResolvedValueOnce({ userId: null });
  expect((await post()).status).toBe(401);
  expect((await post({ sourceId: "invalid" })).status).toBe(400);
  mocks.owned.mockResolvedValueOnce({ error: new Response(null, { status: 404 }) });
  expect((await post()).status).toBe(404);
  expect(mocks.serviceClient).not.toHaveBeenCalled();
});
