import { expect, it, vi } from "vitest";
import { createServiceClient } from "../../supabase/service";
import { runKnowledgeCleanup } from "./cleanup";

const { rpc, remove } = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../supabase/service", () => ({
  createServiceClient: () => ({ rpc, storage: { from: () => ({ remove }) } }),
}));

it("acknowledges only successful removals and retries remaining work on a new run", async () => {
  const first = { storage_key: "project/first.pdf" };
  const second = { storage_key: "project/second.pdf" };
  rpc.mockImplementation((name: string) => {
    if (name === "collect_knowledge_cleanup") return { data: [first, second] };
    return {};
  });
  remove.mockResolvedValueOnce({ error: new Error("Storage unavailable") });
  remove.mockResolvedValue({ error: null });

  expect(await runKnowledgeCleanup(createServiceClient())).toEqual({ removed: 1, failed: 1 });
  expect(rpc).not.toHaveBeenCalledWith("complete_knowledge_cleanup", { p_storage_key: first.storage_key });
  expect(rpc).toHaveBeenCalledWith("complete_knowledge_cleanup", { p_storage_key: second.storage_key });

  rpc.mockImplementation((name: string) => name === "collect_knowledge_cleanup" ? { data: [first] } : {});
  expect(await runKnowledgeCleanup(createServiceClient())).toEqual({ removed: 1, failed: 0 });
  expect(rpc).toHaveBeenCalledWith("complete_knowledge_cleanup", { p_storage_key: first.storage_key });
});
