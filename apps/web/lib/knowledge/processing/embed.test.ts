import { afterEach, expect, it, vi } from "vitest";
import { embedKnowledgeChunks } from "./embed";

const create = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("openai", () => ({ default: class { embeddings = { create }; } }));

afterEach(() => vi.resetAllMocks());

it("stores vectors by OpenAI response index", async () => {
  const first = Array<number>(1536).fill(1);
  const second = Array<number>(1536).fill(2);
  create.mockResolvedValue({ data: [{ index: 1, embedding: second }, { index: 0, embedding: first }] });
  await expect(embedKnowledgeChunks(["one", "two"])).resolves.toEqual([JSON.stringify(first), JSON.stringify(second)]);
  expect(create).toHaveBeenCalledWith({
    model: "text-embedding-3-small", input: ["one", "two"], dimensions: 1536, encoding_format: "float",
  });
});

it("rejects vectors with missing dimensions or nonfinite values", async () => {
  create.mockResolvedValueOnce({ data: [{ index: 0, embedding: [1] }] })
    .mockResolvedValueOnce({ data: [{ index: 0, embedding: Array<number>(1536).fill(Infinity) }] });
  await expect(embedKnowledgeChunks(["one"])).rejects.toThrow("Invalid knowledge embedding");
  await expect(embedKnowledgeChunks(["one"])).rejects.toThrow("Invalid knowledge embedding");
});
