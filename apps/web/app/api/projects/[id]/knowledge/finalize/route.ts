import { auth } from "@clerk/nextjs/server";
import { FinalizeKnowledgeRequestSchema, type FinalizeKnowledgeResponse } from "@askwell/shared";
import { NextResponse } from "next/server";
import { knowledgeSourceResponse, processKnowledge } from "../../../../../../lib/knowledge/processing/process";
import { extractKnowledgeText } from "../../../../../../lib/knowledge/processing/text";
import { KNOWLEDGE_BUCKET, removeKnowledgeFile } from "../../../../../../lib/knowledge/storage/cleanup";
import { projectError } from "../../../../../../lib/projects/http";
import { getOwnedProject } from "../../../../../../lib/supabase/get-owned-project";
import { createOwnerClient } from "../../../../../../lib/supabase/owner";
import { createServiceClient } from "../../../../../../lib/supabase/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return projectError(401, "unauthenticated", "Sign in to continue.");

  const input = FinalizeKnowledgeRequestSchema.safeParse({
    params: await params,
    query: Object.fromEntries(new URL(request.url).searchParams),
    body: await request.json().catch(() => undefined),
  });
  if (!input.success) return projectError(400, "validation_error", "Provide a valid knowledge source ID.");

  try {
    const owned = await getOwnedProject(input.data.params.id);
    if (owned.error) return owned.error;

    const projectId = owned.project.id;
    const { sourceId } = input.data.body;
    const client = createServiceClient();
    const { data: claimed, error } = await client.rpc("claim_knowledge_upload", {
      p_project_id: projectId,
      p_owner_id: userId,
      p_source_id: sourceId,
    }).maybeSingle();
    if (error) throw error;
    if (!claimed) {
      const { data: existing, error: readError } = await createOwnerClient()
        .from("knowledge_sources").select("*").eq("project_id", projectId).eq("id", sourceId).maybeSingle();
      if (readError) throw readError;
      if (!existing?.storage_key) return projectError(404, "not_found", "Knowledge upload not found.");
      if (existing.status === "uploading") {
        return projectError(400, "validation_error", "Upload the file before finalizing. Upload reservations expire after two hours.");
      }
      return NextResponse.json<FinalizeKnowledgeResponse>({ source: knowledgeSourceResponse(existing) });
    }

    const source = await processKnowledge(client, projectId, sourceId, async () => {
      const { storage_key: key, type } = claimed;
      if (!key || (type !== "pdf" && type !== "md" && type !== "txt")) {
        throw new Error("Invalid reserved upload.");
      }
      const { data, error: downloadError } = await client.storage.from(KNOWLEDGE_BUCKET).download(key);
      if (downloadError || !data) throw downloadError ?? new Error("Missing uploaded file.");
      try {
        const text = await extractKnowledgeText(data, type);
        if (!text.replaceAll("\0", "").trim()) throw new Error("The file contains no extractable text.");
        return text;
      } catch (error) {
        await removeKnowledgeFile(client, key);
        throw error;
      }
    });
    return NextResponse.json<FinalizeKnowledgeResponse>({ source: knowledgeSourceResponse(source) });
  } catch {
    return projectError(500, "internal_error", "Could not finalize the knowledge upload.");
  }
}
