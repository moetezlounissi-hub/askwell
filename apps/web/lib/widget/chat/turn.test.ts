import { beforeEach, describe, expect, it, vi } from "vitest";
import { runChatTurn } from "./turn";
import type { createServiceClient } from "../../supabase/service";
import { answerQuestion, embedQuestion } from "./model";

vi.mock("server-only", () => ({}));
vi.mock("./model", () => ({
  answerQuestion: vi.fn(),
  embedQuestion: vi.fn(),
}));

const rpc = vi.fn();
const db = { rpc } as unknown as ReturnType<typeof createServiceClient>;
const input = { key: "pk_test", visitorId: "visitor", message: "When does support open?" };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("runChatTurn", () => {
  it.each([
    ["PT404", "not_found"],
    ["PT429", "limit_exceeded"],
  ])("refuses %s without invoking a model", async (code, status) => {
    rpc.mockResolvedValueOnce({ error: { code } });

    await expect(runChatTurn(db, "project", "free", { ...input, conversationId: "thread" }))
      .resolves.toEqual({ status });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("consume_message", {
      p_project_id: "project",
      p_conversation_id: "thread",
      p_message_limit: 100,
    });
    expect(embedQuestion).not.toHaveBeenCalled();
    expect(answerQuestion).not.toHaveBeenCalled();
  });

  it("charges quota before a model failure and does not save a partial turn", async () => {
    rpc.mockResolvedValueOnce({ error: null });
    vi.mocked(embedQuestion).mockRejectedValueOnce(new Error("Model failed"));

    await expect(runChatTurn(db, "project", "pro", input)).rejects.toThrow("Model failed");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(embedQuestion).mock.invocationCallOrder[0]);
    expect(rpc).toHaveBeenCalledWith("consume_message", expect.objectContaining({ p_message_limit: 2_000 }));
  });

  it("retrieves scoped excerpts and returns the saved conversation ID", async () => {
    rpc.mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ data: [{ content: "Support opens at 9 AM." }], error: null })
      .mockResolvedValueOnce({ data: "new-thread", error: null });
    vi.mocked(embedQuestion).mockResolvedValueOnce("[1]");
    vi.mocked(answerQuestion).mockResolvedValueOnce("Support opens at 9 AM.");

    await expect(runChatTurn(db, "project", "free", input)).resolves.toEqual({
      status: "ok",
      response: { conversationId: "new-thread", reply: "Support opens at 9 AM." },
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "match_chunks", {
      p_project_id: "project",
      p_embedding: "[1]",
    });
    expect(answerQuestion).toHaveBeenCalledWith(input.message, ["Support opens at 9 AM."]);
    expect(rpc).toHaveBeenNthCalledWith(3, "save_chat_turn", {
      p_conversation_id: undefined,
      p_project_id: "project",
      p_visitor_id: "visitor",
      p_message: input.message,
      p_reply: "Support opens at 9 AM.",
    });
  });
});
