import { ResourceIdSchema, type WidgetChatRequest, type WidgetChatResponse } from "@askwell/shared";

const unavailable = "Couldn’t send your message. Please try again.";

export async function sendWidgetMessage(
  body: WidgetChatRequest["body"],
  signal: AbortSignal,
): Promise<WidgetChatResponse> {
  const response = await fetch("/api/widget/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  }).catch(() => {
    throw new Error(unavailable);
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok && payload && typeof payload === "object" && "error" in payload) {
    const { error } = payload;
    if (error && typeof error === "object" && "code" in error) {
      switch (error.code) {
        case "rate_limited":
          throw new Error("You’re sending messages too quickly. Please wait a moment and try again.");
        case "limit_exceeded":
          throw new Error("This chat has reached its monthly message limit.");
        case "message_blocked":
          throw new Error("Your message was blocked. Try rephrasing it.");
      }
    }
  }
  if (response.ok && payload && typeof payload === "object" &&
      "conversationId" in payload && "reply" in payload && typeof payload.reply === "string") {
    const id = ResourceIdSchema.safeParse(payload.conversationId);
    if (id.success && payload.reply.trim()) return { conversationId: id.data, reply: payload.reply };
  }
  throw new Error(unavailable);
}
