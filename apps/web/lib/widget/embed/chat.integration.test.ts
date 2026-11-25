import { afterEach, expect, it, vi } from "vitest";
import { POST } from "../../../app/api/widget/chat/route";
import { sendWidgetMessage } from "./chat";

const { embed, respond, protect, rpc } = vi.hoisted(() => ({
  embed: vi.fn(), respond: vi.fn(), protect: vi.fn(), rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("openai", () => ({
  default: class {
    embeddings = { create: embed };
    responses = { create: respond };
  },
}));
vi.mock("../../arcjet", () => ({ protectWidgetChat: protect }));
vi.mock("../../supabase/service", () => ({ createServiceClient: () => ({ rpc }) }));
vi.mock("../config/lookup", () => ({
  resolveWidgetProject: () => ({ id: "project", plan: "free" }),
}));

afterEach(() => vi.unstubAllGlobals());

it("continues an embed conversation through the chat route with mocked AI and reports both limits", async () => {
  vi.stubGlobal("fetch", (url: string, options: RequestInit) =>
    POST(new Request(new URL(url, "http://localhost"), options)));
  const allowed = { isDenied: () => false, isAllowed: () => true, isErrored: () => false, results: [] };
  const rateLimited = { isDenied: () => true, reason: { isRateLimit: () => true } };
  protect.mockResolvedValue(allowed);
  const conversationId = "00000000-0000-4000-8000-000000000001";
  const excerpt = "The Kestrel help desk closes at 6:37 PM UTC.";
  const signal = new AbortController().signal;
  const visitor = { key: "pk_kestrel", visitorId: "visitor" };

  embed.mockResolvedValue({ data: [{ embedding: Array<number>(1536).fill(1) }] });
  respond.mockResolvedValueOnce({ status: "completed", output_text: excerpt })
    .mockResolvedValueOnce({ status: "completed", output_text: "I don't know" });
  rpc.mockResolvedValueOnce({ error: null })
    .mockResolvedValueOnce({ data: [{ content: excerpt }], error: null })
    .mockResolvedValueOnce({ data: conversationId, error: null })
    .mockResolvedValueOnce({ error: null })
    .mockResolvedValueOnce({ data: [{ content: excerpt }], error: null })
    .mockResolvedValueOnce({ data: conversationId, error: null })
    .mockResolvedValueOnce({ error: { code: "PT429" } });

  const first = await sendWidgetMessage({ ...visitor, message: "When do you close?" }, signal);
  expect(first).toEqual({ conversationId, reply: excerpt });
  const followUp = { ...visitor, conversationId: first.conversationId, message: "How far away is Neptune?" };
  await expect(sendWidgetMessage(followUp, signal)).resolves.toEqual({ conversationId, reply: "I don't know" });
  expect(rpc).toHaveBeenNthCalledWith(6, "save_chat_turn", expect.objectContaining({
    p_conversation_id: conversationId, p_visitor_id: visitor.visitorId, p_reply: "I don't know",
  }));

  await expect(sendWidgetMessage(followUp, signal)).rejects.toThrow("monthly message limit");
  protect.mockResolvedValueOnce(rateLimited);
  await expect(sendWidgetMessage(followUp, signal)).rejects.toThrow("sending messages too quickly");
  expect(embed).toHaveBeenCalledTimes(2);
  expect(respond).toHaveBeenCalledTimes(2);
  expect(rpc).toHaveBeenCalledTimes(7);
});
