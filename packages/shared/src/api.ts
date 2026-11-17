import type { z } from "zod";
import type * as schemas from "./schemas";
import type { WidgetConfig } from "./widget";

/** Wire timestamps use ISO strings; resource IDs use UUID strings. */
export interface Project {
  id: string;
  name: string;
  publicKey: string;
  messagesUsed: number;
  periodStart: string;
  createdAt: string;
}
export type KnowledgeSourceType = "text" | "pdf" | "md" | "txt";
export type KnowledgeSourceStatus = "uploading" | "processing" | "ready" | "failed";
export interface KnowledgeSource {
  id: string;
  projectId: string;
  title: string;
  type: KnowledgeSourceType;
  storageKey: string | null;
  status: KnowledgeSourceStatus;
  createdAt: string;
}
export interface Conversation {
  id: string;
  projectId: string;
  visitorId: string;
  createdAt: string;
}
export type ConversationSummary = Omit<Conversation, "projectId"> & {
  firstMessagePreview: string;
  messageCount: number;
};
export type MessageRole = "visitor" | "bot";
export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  body: string;
  createdAt: string;
}
export type ApiErrorCode =
  | "validation_error" | "unauthenticated" | "forbidden" | "not_found"
  | "plan_required" | "limit_exceeded" | "rate_limited" | "message_blocked"
  | "internal_error";
export interface ApiError {
  error: { code: ApiErrorCode; message: string };
}

export type WidgetConfigResponse = WidgetConfig;
export interface WidgetChatResponse { conversationId: string; reply: string }
export interface ListProjectsResponse { projects: Project[] }
export interface CreateProjectResponse { project: Project }
export interface UpdateProjectResponse { project: Project }
/** HTTP 204, no response body. */
export type DeleteProjectResponse = void;
export interface CreateKnowledgeResponse { source: KnowledgeSource }
export interface KnowledgeUploadUrlResponse {
  sourceId: string;
  signedUrl: string;
  storageKey: string;
}
export interface FinalizeKnowledgeResponse { source: KnowledgeSource }
/** HTTP 204, no response body. */
export type DeleteKnowledgeResponse = void;
export interface ListConversationsResponse { conversations: ConversationSummary[] }
export interface ConversationThreadResponse {
  conversation: Conversation;
  messages: Message[];
}
export interface UpdateWidgetConfigResponse { config: WidgetConfig }

export interface PosthogConfigResponse { key: string; host: string }
/**
 * Pass raw signed bytes untouched to Clerk's verifier before parsing JSON.
 * Do not parse or re-encode JSON before signature verification.
 * VerifiedBillingEvent is internal and never substitutes for verification.
 */
export type ClerkWebhookRequest = Uint8Array;
export interface ClerkWebhookResponse { received: true }

export type WidgetConfigRequest = z.infer<typeof schemas.WidgetConfigRequestSchema>;
export type WidgetChatRequest = z.infer<typeof schemas.WidgetChatRequestSchema>;
export type ListProjectsRequest = z.infer<typeof schemas.ListProjectsRequestSchema>;
export type CreateProjectRequest = z.infer<typeof schemas.CreateProjectRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof schemas.UpdateProjectRequestSchema>;
export type DeleteProjectRequest = z.infer<typeof schemas.DeleteProjectRequestSchema>;
export type CreateKnowledgeRequest = z.infer<typeof schemas.CreateKnowledgeRequestSchema>;
export type KnowledgeUploadUrlRequest = z.infer<typeof schemas.KnowledgeUploadUrlRequestSchema>;
export type FinalizeKnowledgeRequest = z.infer<typeof schemas.FinalizeKnowledgeRequestSchema>;
export type DeleteKnowledgeRequest = z.infer<typeof schemas.DeleteKnowledgeRequestSchema>;
export type ListConversationsRequest = z.infer<typeof schemas.ListConversationsRequestSchema>;
export type ConversationThreadRequest = z.infer<typeof schemas.ConversationThreadRequestSchema>;
export type UpdateWidgetConfigRequest = z.infer<typeof schemas.UpdateWidgetConfigRequestSchema>;
export type PosthogConfigRequest = z.infer<typeof schemas.PosthogConfigRequestSchema>;
export type VerifiedBillingEvent = z.infer<typeof schemas.VerifiedBillingEventSchema>;
export type AbsentBody = undefined;
export type AbsentParams = undefined;
