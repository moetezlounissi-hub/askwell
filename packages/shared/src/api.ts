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
export type PosthogConfigRequest = void;
export interface PosthogConfigResponse { key: string; host: string }
/**
 * Pass raw signed bytes untouched to Clerk's verifier before parsing JSON.
 * No shared JSON schema or normalized billing event is defined here.
 */
export type ClerkWebhookRequest = Uint8Array;
export interface ClerkWebhookResponse { received: true }
