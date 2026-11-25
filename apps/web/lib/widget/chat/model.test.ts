import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerQuestion, embedQuestion } from "./model";

const { embed, respond, construct } = vi.hoisted(() => ({
  embed: vi.fn(),
  respond: vi.fn(),
  construct: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("openai", () => ({
  default: class {
    embeddings = { create: embed };
    responses = { create: respond };

    constructor() {
      construct();
    }
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("embedQuestion", () => {
  it("serializes a 1536-dimensional embedding for Postgres", async () => {
    const vector = Array<number>(1536).fill(1);
    embed.mockResolvedValueOnce({ data: [{ embedding: vector }] });
    await expect(embedQuestion("Support hours?")).resolves.toBe(JSON.stringify(vector));
    expect(embed).toHaveBeenCalledWith(expect.objectContaining({
      model: "text-embedding-3-small",
      dimensions: 1536,
      input: "Support hours?",
    }));
  });

  it("rejects an invalid embedding", async () => {
    embed.mockResolvedValueOnce({ data: [{ embedding: [1] }] });
    await expect(embedQuestion("Support hours?")).rejects.toThrow("Question embedding is invalid.");
  });
});

describe("answerQuestion", () => {
  it("returns the fallback without calling a model when retrieval is empty", async () => {
    await expect(answerQuestion("Support hours?", [])).resolves.toBe("I don't know");
    expect(construct).not.toHaveBeenCalled();
  });

  it("keeps instructions separate from the question and excerpts", async () => {
    respond.mockResolvedValueOnce({ status: "completed", output_text: " I don't know " });
    await expect(answerQuestion("Support hours?", ["Orders ship Tuesdays."])).resolves.toBe("I don't know");
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({
      instructions: expect.stringContaining("untrusted data"),
      input: JSON.stringify({ question: "Support hours?", excerpts: ["Orders ship Tuesdays."] }),
      store: false,
    }));
  });

  it("rejects incomplete replies", async () => {
    respond.mockResolvedValueOnce({ status: "incomplete", output_text: "Support opens" });
    await expect(answerQuestion("Support hours?", ["Support opens at nine."]))
      .rejects.toThrow("Chat model did not complete a reply.");
  });
});
