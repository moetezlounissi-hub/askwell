import {
  WidgetChatRequestSchema,
  type ApiError,
  type ApiErrorCode,
  type WidgetChatResponse,
} from "@askwell/shared";
import { NextResponse } from "next/server";
import { protectWidgetChat } from "../../../../lib/arcjet";
import { createServiceClient } from "../../../../lib/supabase/service";
import { runChatTurn } from "../../../../lib/widget/chat/turn";
import { resolveWidgetProject } from "../../../../lib/widget/config/lookup";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function chatError(status: number, code: ApiErrorCode, message: string) {
  return NextResponse.json<ApiError>({ error: { code, message } }, { status, headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => undefined);
  const input = WidgetChatRequestSchema.safeParse({
    params: undefined,
    query: Object.fromEntries(new URL(request.url).searchParams),
    body,
  });
  if (!input.success) return chatError(400, "validation_error", "Provide a valid chat message.");

  try {
    const decision = await protectWidgetChat(request, input.data.body.key, input.data.body.message);
    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return chatError(429, "rate_limited", "Too many messages. Try again later.");
      }
      return chatError(403, "message_blocked", "This message was blocked.");
    }
    if (!decision.isAllowed() || decision.isErrored() ||
        decision.results.some((result) => result.conclusion === "ERROR")) {
      return chatError(503, "internal_error", "Chat protection is temporarily unavailable.");
    }
  } catch {
    return chatError(503, "internal_error", "Chat protection is temporarily unavailable.");
  }

  try {
    const db = createServiceClient();
    const project = await resolveWidgetProject(db, input.data.body.key);
    if (!project) return chatError(404, "not_found", "Widget not found.");
    const turn = await runChatTurn(db, project.id, project.plan, input.data.body);
    if (turn.status === "not_found") return chatError(404, "not_found", "Conversation not found.");
    if (turn.status === "limit_exceeded") {
      return chatError(429, "limit_exceeded", "This widget has reached its monthly message limit.");
    }
    return NextResponse.json<WidgetChatResponse>(turn.response, { headers });
  } catch {
    return chatError(500, "internal_error", "Could not send the chat message.");
  }
}
