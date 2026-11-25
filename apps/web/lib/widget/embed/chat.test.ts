import { afterEach, expect, it, vi } from "vitest";
import { sendWidgetMessage } from "./chat";

const body = { key: "pk_kestrel", visitorId: "visitor", message: "When do you close?" };
const conversationId = "00000000-0000-4000-8000-000000000001";
const signal = new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

it("posts both turns to the same-origin endpoint and sends the returned ID on continuation", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ conversationId, reply: "We close at 6:37 PM UTC." }))
    .mockResolvedValueOnce(Response.json({ conversationId, reply: "I don't know" }));
  vi.stubGlobal("fetch", fetch);

  const first = await sendWidgetMessage(body, signal);
  expect(first.reply).toBe("We close at 6:37 PM UTC.");
  const followUp = { ...body, conversationId: first.conversationId, message: "How far away is Neptune?" };
  await expect(sendWidgetMessage(followUp, signal)).resolves.toEqual({ conversationId, reply: "I don't know" });

  expect(fetch).toHaveBeenNthCalledWith(1, "/api/widget/chat", expect.objectContaining({
    method: "POST", body: JSON.stringify(body), signal,
  }));
  expect(fetch).toHaveBeenNthCalledWith(2, "/api/widget/chat", expect.objectContaining({
    method: "POST", body: JSON.stringify({ ...followUp, conversationId }), signal,
  }));
});

it.each([
  [429, "rate_limited", "sending messages too quickly"],
  [429, "limit_exceeded", "monthly message limit"],
  [403, "message_blocked", "Try rephrasing it"],
  [500, "internal_error", "Please try again"],
])("shows visitor feedback for %s %s", async (status, code, message) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code } }, { status })));
  await expect(sendWidgetMessage(body, signal)).rejects.toThrow(message);
});

it("rejects malformed success responses", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ conversationId: "invalid", reply: "Hello" })));
  await expect(sendWidgetMessage(body, signal)).rejects.toThrow("Please try again");
});
