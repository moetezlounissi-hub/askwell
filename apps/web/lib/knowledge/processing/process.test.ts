import { afterEach, expect, it, vi } from "vitest";
import type { createServiceClient } from "../../supabase/service";
import { knowledgeSourceResponse, processKnowledge } from "./process";

const embed = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("./embed", () => ({ embedKnowledgeChunks: embed }));

afterEach(() => vi.resetAllMocks());

function database() {
  const row = {
    project_id: "project", id: "source", type: "text", title: "Guide", storage_key: null,
    created_at: "2026-11-25T00:00:00.000Z",
  };
  const insert = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(({ status }: { status: string }) => ({
    eq: () => ({ eq: () => ({ eq: () => ({ select: () => ({
      single: async () => ({ data: { ...row, status } }),
    }) }) }) }),
  }));
  const client = { from: () => ({ update, insert, delete: () => ({ eq: () => ({ eq: remove }) }) }) } as unknown as ReturnType<typeof createServiceClient>;
  return { client, update, insert, remove };
}

it("stores normalized pasted text and embeddings before publishing the source", async () => {
  const { client, insert, update } = database();
  const vector = JSON.stringify(Array<number>(1536).fill(1));
  embed.mockResolvedValue([vector]);
  const source = await processKnowledge(client, "project", "source", async () => "Support\n  closes at six.");
  expect(insert).toHaveBeenCalledWith([{
    project_id: "project", source_id: "source", content: "Support closes at six.", embedding: vector,
  }]);
  expect(insert).toHaveBeenCalledBefore(update);
  expect(knowledgeSourceResponse(source)).toEqual({
    projectId: "project", id: "source", title: "Guide", type: "text", status: "ready",
    storageKey: null, createdAt: "2026-11-25T00:00:00.000Z",
  });
});

it("marks a failed source and removes partial chunks when a later batch fails", async () => {
  const { client, insert, update, remove } = database();
  embed.mockImplementationOnce(async (chunks: string[]) => chunks.map(() => "[1]"))
    .mockRejectedValueOnce(new Error("Unavailable"));
  const source = await processKnowledge(client, "project", "source", async () => "a".repeat(55_000));
  expect(source.status).toBe("failed");
  expect(insert).toHaveBeenCalledTimes(1);
  expect(insert.mock.calls[0][0]).toHaveLength(32);
  expect(update).toHaveBeenCalledWith({ status: "failed" });
  expect(remove).toHaveBeenCalledWith("source_id", "source");
});
