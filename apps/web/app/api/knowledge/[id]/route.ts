import { auth } from "@clerk/nextjs/server";
import { DeleteKnowledgeRequestSchema } from "@askwell/shared";
import { removeKnowledgeFile } from "../../../../lib/knowledge/storage/cleanup";
import { projectError } from "../../../../lib/projects/http";
import { createOwnerClient } from "../../../../lib/supabase/owner";
import { createServiceClient } from "../../../../lib/supabase/service";

async function isEmptyBody(body: Request["body"]): Promise<boolean> {
  if (body === null) return true;

  const reader = body.getReader();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return true;
      if (chunk.value.byteLength > 0) {
        // Cancellation can take longer than the validation response.
        void reader.cancel().catch(() => {});
        return false;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return projectError(401, "unauthenticated", "Sign in to continue.");

  const emptyBody = await isEmptyBody(request.body).catch(() => false);
  const input = DeleteKnowledgeRequestSchema.safeParse({
    params: await params,
    query: Object.fromEntries(new URL(request.url).searchParams),
    body: emptyBody ? undefined : null,
  });
  if (!input.success) return projectError(400, "validation_error", "Invalid knowledge source deletion request.");

  try {
    const sourceId = input.data.params.id;
    const { data: source, error: readError } = await createOwnerClient()
      .from("knowledge_sources").select("id").eq("id", sourceId).maybeSingle();
    if (readError) return projectError(500, "internal_error", "Could not load knowledge source.");
    if (!source) return projectError(404, "not_found", "Knowledge source not found.");

    const client = createServiceClient();
    const { data: deleted, error } = await client.rpc("delete_knowledge_source", {
      p_owner_id: userId,
      p_source_id: sourceId,
    }).maybeSingle();
    if (error) return projectError(500, "internal_error", "Could not delete knowledge source.");
    if (!deleted) return projectError(404, "not_found", "Knowledge source not found.");
    if (deleted.storage_key) {
      // The ledger retains the file key if Storage is unavailable.
      await removeKnowledgeFile(client, deleted.storage_key).catch(() => {});
    }
    return new Response(null, { status: 204 });
  } catch {
    return projectError(500, "internal_error", "Could not delete knowledge source.");
  }
}
