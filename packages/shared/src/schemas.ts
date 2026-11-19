import { z } from "zod";
import { MAX_KNOWLEDGE_FILE_BYTES, MAX_MESSAGE_CHARACTERS } from "./widget";

export const EmptyQuerySchema = z.strictObject({});
export const NoBodySchema = z.undefined();
export const ResourceIdSchema = z.uuid();
export const PublicKeySchema = z.string().max(255).regex(/^pk_[A-Za-z0-9_-]+$/);
export const VisitorIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const name = z.string().trim().min(1).max(100);
const title = z.string().trim().min(1).max(200);
const preservedText = (max: number) => z.string().refine((value) => value.length <= max, "Too long").refine((value) => value.trim().length > 0, "Must not be blank");
export const IdParamsSchema = z.strictObject({ id: ResourceIdSchema });
export const WidgetConfigQuerySchema = z.strictObject({ key: PublicKeySchema });
export const WidgetChatBodySchema = z.strictObject({
  key: PublicKeySchema, visitorId: VisitorIdSchema,
  conversationId: ResourceIdSchema.optional(), message: preservedText(MAX_MESSAGE_CHARACTERS),
});
export const CreateProjectBodySchema = z.strictObject({ name });
export const UpdateProjectBodySchema = z.strictObject({ name });
export const CreateKnowledgeBodySchema = z.strictObject({ title, text: preservedText(1_000_000) });
export const KnowledgeUploadUrlBodySchema = z.strictObject({
  title,
  fileName: z.string().min(1).max(255).regex(/^[^/\\\x00-\x1f\x7f]+$/).regex(/\.(pdf|md|txt)$/i),
  contentType: z.enum(["application/pdf", "text/markdown", "text/plain"]),
  sizeBytes: z.number().int().min(1).max(MAX_KNOWLEDGE_FILE_BYTES),
}).refine(({ fileName, contentType }) => {
  const extension = fileName.split(".").at(-1)?.toLowerCase();
  return extension === "pdf" ? contentType === "application/pdf"
    : extension === "md" ? contentType === "text/markdown" || contentType === "text/plain"
      : extension === "txt" && contentType === "text/plain";
}, "File extension and MIME type must match");
export const FinalizeKnowledgeBodySchema = z.strictObject({ sourceId: ResourceIdSchema });
export const UpdateWidgetConfigBodySchema = z.strictObject({
  buttonColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  position: z.enum(["bottom-right", "bottom-left", "top-right", "top-left"]),
  animation: z.enum(["fade", "slide", "scale"]),
  label: z.string().trim().min(1).max(80),
  headerText: z.string().trim().min(1).max(120),
  showBadge: z.boolean(),
});

/** Internal representation ONLY after signature verification and provider extraction.
 * The billing adapter must verify the untouched Request with verifyWebhook first.
 * Extract data.payer.user_id/data.plan.slug only for user-scoped Pro events.
 * Ignore organization payers and unrelated events/plans. Malformed relevant events
 * cannot update a plan. Cancellation retains Pro until term end; never infer ended
 * from canceled, past_due, expired or unknown statuses. Provider SDK extraction,
 * persistence, ordering and idempotency belong to the later billing adapter.
 */
export const VerifiedBillingEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("subscriptionItem.active"), userId: z.string().min(1), plan: z.literal("pro"), status: z.literal("active") }),
  z.strictObject({ type: z.literal("subscriptionItem.ended"), userId: z.string().min(1), plan: z.literal("pro"), status: z.literal("ended") }),
]);

const withoutParams = <T extends z.ZodType>(body: T) => z.strictObject({ params: z.undefined(), query: EmptyQuerySchema, body });
const withId = <T extends z.ZodType>(body: T) => z.strictObject({ params: IdParamsSchema, query: EmptyQuerySchema, body });
// These envelopes describe already separated route inputs, not HTTP wire bodies.
export const WidgetConfigRequestSchema = z.strictObject({ params: z.undefined(), query: WidgetConfigQuerySchema, body: NoBodySchema });
export const WidgetChatRequestSchema = withoutParams(WidgetChatBodySchema);
export const ListProjectsRequestSchema = withoutParams(NoBodySchema);
export const CreateProjectRequestSchema = withoutParams(CreateProjectBodySchema);
export const UpdateProjectRequestSchema = withId(UpdateProjectBodySchema);
export const DeleteProjectRequestSchema = withId(NoBodySchema);
export const CreateKnowledgeRequestSchema = withId(CreateKnowledgeBodySchema);
export const KnowledgeUploadUrlRequestSchema = withId(KnowledgeUploadUrlBodySchema);
export const FinalizeKnowledgeRequestSchema = withId(FinalizeKnowledgeBodySchema);
export const DeleteKnowledgeRequestSchema = withId(NoBodySchema);
export const ListConversationsRequestSchema = withId(NoBodySchema);
export const ConversationThreadRequestSchema = withId(NoBodySchema);
export const UpdateWidgetConfigRequestSchema = withId(UpdateWidgetConfigBodySchema);
export const PosthogConfigRequestSchema = withoutParams(NoBodySchema);
// No JSON schema for ClerkWebhookRequest: its bytes must reach the verifier intact.
