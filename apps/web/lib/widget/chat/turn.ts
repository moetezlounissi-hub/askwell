import "server-only";

import { PLAN_LIMITS, type Plan, type WidgetChatRequest, type WidgetChatResponse } from "@askwell/shared";
import { createServiceClient } from "../../supabase/service";
import { answerQuestion, embedQuestion } from "./model";

type TurnResult =
  | { status: "not_found" }
  | { status: "limit_exceeded" }
  | { status: "ok"; response: WidgetChatResponse };

export async function runChatTurn(
  db: ReturnType<typeof createServiceClient>,
  projectId: string,
  plan: Plan,
  { message, visitorId, conversationId }: WidgetChatRequest["body"],
): Promise<TurnResult> {
  const conversation = {
    p_project_id: projectId,
    p_conversation_id: conversationId,
  };

  // This RPC checks conversation ownership and charges quota in one transaction.
  const { error: quotaError } = await db.rpc("consume_message", {
    ...conversation,
    p_message_limit: PLAN_LIMITS[plan].messagesPerMonth,
  });
  if (quotaError?.code === "PT404") return { status: "not_found" };
  if (quotaError?.code === "PT429") return { status: "limit_exceeded" };
  if (quotaError) throw new Error("Could not consume chat quota.", { cause: quotaError });

  const embedding = await embedQuestion(message);
  const { data: chunks, error: retrievalError } = await db.rpc("match_chunks", {
    p_project_id: projectId,
    p_embedding: embedding,
  });
  if (retrievalError) throw new Error("Could not retrieve chat excerpts.", { cause: retrievalError });

  const reply = await answerQuestion(message, chunks.map((chunk) => chunk.content));
  const { data: id, error: saveError } = await db.rpc("save_chat_turn", {
    ...conversation,
    p_message: message,
    p_visitor_id: visitorId,
    p_reply: reply,
  });
  if (saveError?.code === "PT404") return { status: "not_found" };
  if (saveError || !id) throw new Error("Could not save the chat turn.", { cause: saveError });

  return { status: "ok", response: { conversationId: id, reply } };
}
