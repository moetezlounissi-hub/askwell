import { describe, expect, it } from "vitest";
import * as s from "./schemas";
import { DEFAULT_WIDGET_CONFIG, MAX_KNOWLEDGE_FILE_BYTES } from "./widget";

const id = "550e8400-e29b-41d4-a716-446655440000";
const chat = { key: "pk_Ab-1", visitorId: "visitor_1", message: " hello " };
const file = { title: " File ", fileName: "Guide.PDF", contentType: "application/pdf", sizeBytes: 1 };

describe("route contracts", () => {
  const routes = [
    [s.WidgetConfigRequestSchema, { query: { key: "pk_A" } }],
    [s.WidgetChatRequestSchema, { query: {}, body: chat }],
    [s.ListProjectsRequestSchema, { query: {} }],
    [s.CreateProjectRequestSchema, { query: {}, body: { name: "Project" } }],
    [s.UpdateProjectRequestSchema, { params: { id }, query: {}, body: { name: "Project" } }],
    [s.DeleteProjectRequestSchema, { params: { id }, query: {} }],
    [s.CreateKnowledgeRequestSchema, { params: { id }, query: {}, body: { title: "Title", text: "Text" } }],
    [s.KnowledgeUploadUrlRequestSchema, { params: { id }, query: {}, body: file }],
    [s.FinalizeKnowledgeRequestSchema, { params: { id }, query: {}, body: { sourceId: id } }],
    [s.DeleteKnowledgeRequestSchema, { params: { id }, query: {} }],
    [s.ListConversationsRequestSchema, { params: { id }, query: {} }],
    [s.ConversationThreadRequestSchema, { params: { id }, query: {} }],
    [s.UpdateWidgetConfigRequestSchema, { params: { id }, query: {}, body: DEFAULT_WIDGET_CONFIG }],
    [s.PosthogConfigRequestSchema, { query: {} }],
  ] as const;
  it.each(routes.map(([schema, input], index) => ({ schema, input, index })))("route $index accepts approved input and rejects extra query fields", ({ schema, input }) => {
    expect(schema.safeParse({ params: undefined, body: undefined, ...input }).success).toBe(true);
    expect(schema.safeParse({ ...input, query: { ...input.query, page: 1 } }).success).toBe(false);
    expect(schema.safeParse({ ...input, body: null }).success).toBe(false);
  });
  it("requires UUID resource IDs and explicit absent input", () => {
    expect(s.IdParamsSchema.safeParse({ id }).success).toBe(true);
    for (const value of ["user_123", "", null, 12]) expect(s.IdParamsSchema.safeParse({ id: value }).success).toBe(false);
    expect(s.IdParamsSchema.safeParse({ id, other: true }).success).toBe(false);
    expect(s.NoBodySchema.safeParse({}).success).toBe(false);
    expect(s.NoBodySchema.safeParse(undefined).success).toBe(true);
    expect(s.ListProjectsRequestSchema.safeParse({ params: { id }, query: {} }).success).toBe(false);
  });
});

it("checks case-preserving public keys and bounded visitor IDs", () => {
  expect(s.PublicKeySchema.parse("pk_Ab-C_1")).toBe("pk_Ab-C_1");
  expect(s.PublicKeySchema.safeParse("pk_" + "a".repeat(252)).success).toBe(true);
  for (const key of ["pk_", "PK_a", "pk_a b", " pk_a", "pk_" + "a".repeat(253), null]) expect(s.PublicKeySchema.safeParse(key).success).toBe(false);
  for (const visitor of ["a", "A_-".repeat(42) + "aa"]) expect(s.VisitorIdSchema.safeParse(visitor).success).toBe(true);
  for (const visitor of ["", "a".repeat(129), "a b", null]) expect(s.VisitorIdSchema.safeParse(visitor).success).toBe(false);
});

it("trims names/titles with exact boundaries and rejects missing/null/unknown", () => {
  for (const [schema, key, max] of [[s.CreateProjectBodySchema, "name", 100], [s.CreateKnowledgeBodySchema, "title", 200]] as const) {
    const base = key === "title" ? { text: "text" } : {};
    expect(schema.parse({ ...base, [key]: " a " })).toMatchObject({ [key]: "a" });
    expect(schema.safeParse({ ...base, [key]: "a".repeat(max) }).success).toBe(true);
    for (const value of ["", " \n ", "a".repeat(max + 1), null]) expect(schema.safeParse({ ...base, [key]: value }).success).toBe(false);
    expect(schema.safeParse(base).success).toBe(false);
    expect(schema.safeParse({ ...base, [key]: "a", extra: true }).success).toBe(false);
  }
});

it("preserves nonblank messages/text and measures UTF-16 length", () => {
  expect(s.WidgetChatBodySchema.parse(chat).message).toBe(" hello ");
  expect(s.CreateKnowledgeBodySchema.parse({ title: "T", text: " \ntext\n " }).text).toBe(" \ntext\n ");
  for (const message of ["a", "a".repeat(1000), "😀".repeat(500)]) expect(s.WidgetChatBodySchema.safeParse({ ...chat, message }).success).toBe(true);
  for (const message of ["", " \n", "a".repeat(1001), "😀".repeat(501), null]) expect(s.WidgetChatBodySchema.safeParse({ ...chat, message }).success).toBe(false);
  expect(s.WidgetChatBodySchema.safeParse({ ...chat, conversationId: id }).success).toBe(true);
  for (const conversationId of [null, "bad"]) expect(s.WidgetChatBodySchema.safeParse({ ...chat, conversationId }).success).toBe(false);
  for (const text of ["a", "a".repeat(1_000_000)]) expect(s.CreateKnowledgeBodySchema.safeParse({ title: "T", text }).success).toBe(true);
  for (const text of ["", " \n", "a".repeat(1_000_001), null]) expect(s.CreateKnowledgeBodySchema.safeParse({ title: "T", text }).success).toBe(false);
});

it("validates file basename, exact MIME pairing and integer byte limits", () => {
  expect(s.KnowledgeUploadUrlBodySchema.parse(file).fileName).toBe("Guide.PDF");
  for (const [fileName, contentType] of [["a.pdf", "application/pdf"], ["a.MD", "text/markdown"], ["a.md", "text/plain"], ["a.txt", "text/plain"], ["a".repeat(251) + ".txt", "text/plain"]]) {
    expect(s.KnowledgeUploadUrlBodySchema.safeParse({ ...file, fileName, contentType }).success).toBe(true);
  }
  for (const fileName of ["", "../a.pdf", "a/b.pdf", "a\\b.pdf", "a\n.pdf", "a\x7f.pdf", "a.exe", "a.pdf ", "a".repeat(252) + ".pdf"]) expect(s.KnowledgeUploadUrlBodySchema.safeParse({ ...file, fileName }).success).toBe(false);
  for (const contentType of ["text/plain", "Application/Pdf", "application/octet-stream", null]) expect(s.KnowledgeUploadUrlBodySchema.safeParse({ ...file, contentType }).success).toBe(false);
  expect(s.KnowledgeUploadUrlBodySchema.safeParse({ ...file, fileName: "a.txt", contentType: "text/markdown" }).success).toBe(false);
  for (const sizeBytes of [1, MAX_KNOWLEDGE_FILE_BYTES]) expect(s.KnowledgeUploadUrlBodySchema.safeParse({ ...file, sizeBytes }).success).toBe(true);
  for (const sizeBytes of [0, -1, 1.5, MAX_KNOWLEDGE_FILE_BYTES + 1, "1", null]) expect(s.KnowledgeUploadUrlBodySchema.safeParse({ ...file, sizeBytes }).success).toBe(false);
});

it("requires complete config and validates enums, colors, trimmed copy and booleans", () => {
  expect(s.UpdateWidgetConfigBodySchema.parse({ ...DEFAULT_WIDGET_CONFIG, label: " Ask " }).label).toBe("Ask");
  for (const position of ["bottom-right", "bottom-left", "top-right", "top-left"]) expect(s.UpdateWidgetConfigBodySchema.safeParse({ ...DEFAULT_WIDGET_CONFIG, position }).success).toBe(true);
  for (const animation of ["fade", "slide", "scale"]) expect(s.UpdateWidgetConfigBodySchema.safeParse({ ...DEFAULT_WIDGET_CONFIG, animation }).success).toBe(true);
  for (const [key, max] of [["label", 80], ["headerText", 120]] as const) {
    for (const value of ["a", "a".repeat(max)]) expect(s.UpdateWidgetConfigBodySchema.safeParse({ ...DEFAULT_WIDGET_CONFIG, [key]: value }).success).toBe(true);
    for (const value of [" ", "a".repeat(max + 1)]) expect(s.UpdateWidgetConfigBodySchema.safeParse({ ...DEFAULT_WIDGET_CONFIG, [key]: value }).success).toBe(false);
  }
  for (const key of Object.keys(DEFAULT_WIDGET_CONFIG)) {
    const partial: Record<string, unknown> = { ...DEFAULT_WIDGET_CONFIG }; delete partial[key];
    expect(s.UpdateWidgetConfigBodySchema.safeParse(partial).success).toBe(false);
    expect(s.UpdateWidgetConfigBodySchema.safeParse({ ...DEFAULT_WIDGET_CONFIG, [key]: null }).success).toBe(false);
  }
  for (const bad of [{ buttonColor: "#fff" }, { buttonColor: "#gg0000" }, { position: "left" }, { animation: "none" }, { showBadge: "true" }, { extra: true }]) expect(s.UpdateWidgetConfigBodySchema.safeParse({ ...DEFAULT_WIDGET_CONFIG, ...bad }).success).toBe(false);
});

it("accepts only verified active/ended representations without inferring transitions", () => {
  for (const status of ["active", "ended"]) expect(s.VerifiedBillingEventSchema.safeParse({ type: `subscriptionItem.${status}`, userId: "opaque", plan: "pro", status }).success).toBe(true);
  const event = { type: "subscriptionItem.active", userId: "opaque", plan: "pro", status: "active" };
  for (const status of ["ended", "canceled", "past_due", "expired", "unknown", null]) expect(s.VerifiedBillingEventSchema.safeParse({ ...event, status }).success).toBe(false);
  for (const bad of [{ type: "subscriptionItem.canceled" }, { userId: "" }, { userId: null }, { plan: "free" }, { extra: true }]) expect(s.VerifiedBillingEventSchema.safeParse({ ...event, ...bad }).success).toBe(false);
  expect(s.VerifiedBillingEventSchema.safeParse({ ...event, type: "subscriptionItem.ended" }).success).toBe(false);
  for (const key of Object.keys(event)) {
    const partial: Record<string, unknown> = { ...event }; delete partial[key];
    expect(s.VerifiedBillingEventSchema.safeParse(partial).success).toBe(false);
  }
});
