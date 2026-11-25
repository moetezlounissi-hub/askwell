import { auth } from "@clerk/nextjs/server";
import { KnowledgeUploadUrlRequestSchema, PLAN_LIMITS, type KnowledgeUploadUrlResponse } from "@askwell/shared";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { KNOWLEDGE_BUCKET } from "../../../../../../lib/knowledge/storage/cleanup";
import { projectError } from "../../../../../../lib/projects/http";
import { getOwnedProject } from "../../../../../../lib/supabase/get-owned-project";
import { createOwnerClient } from "../../../../../../lib/supabase/owner";
import { createServiceClient } from "../../../../../../lib/supabase/service";


export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return projectError(401, "unauthenticated", "Sign in to continue.");

  const input = KnowledgeUploadUrlRequestSchema.safeParse({
    params: await params,
    query: Object.fromEntries(new URL(request.url).searchParams),
    body: await request.json().catch(() => undefined),
  });
  if (!input.success) return projectError(400, "validation_error", "Provide a valid PDF, Markdown, or text file up to 10 MB.");

  try {
    const owned = await getOwnedProject(input.data.params.id);
    if (owned.error) return owned.error;

    const { data: account, error: accountError } = await createOwnerClient()
      .from("accounts").select("plan").eq("clerk_user_id", userId).single();
    if (accountError || (account?.plan !== "free" && account?.plan !== "pro")) {
      return projectError(500, "internal_error", "Could not load your plan.");
    }

    const { title, fileName } = input.data.body;
    const extension = fileName.split(".").at(-1)?.toLowerCase();
    const type = extension === "pdf" ? "pdf" : extension === "md" ? "md" : "txt";
    const storageKey = `${owned.project.id}/${randomUUID()}.${type}`;
    const client = createServiceClient();
    const limit = PLAN_LIMITS[account.plan].knowledgeSources;
    const { data: reservation, error } = await client.rpc("reserve_knowledge_source", {
      p_project_id: owned.project.id,
      p_owner_id: userId,
      p_title: title,
      p_type: type,
      p_source_limit: limit,
      p_storage_key: storageKey,
    }).single();

    if (error?.code === "PT404") return projectError(404, "not_found", "Project not found.");
    if (error?.code === "PT409") return projectError(409, "limit_exceeded", `This project can have up to ${limit} knowledge sources.`);
    if (error || !reservation) return projectError(500, "internal_error", "Could not reserve the upload.");

    const sourceId = reservation.source_id;
    try {
      const { data, error: storageError } = await client.storage.from(KNOWLEDGE_BUCKET)
        .createSignedUploadUrl(storageKey, { upsert: false });
      if (storageError || !data) throw storageError ?? new Error("Missing signed upload URL");
      return NextResponse.json<KnowledgeUploadUrlResponse>({ sourceId, signedUrl: data.signedUrl, storageKey });
    } catch {
      // A failed compensation leaves a reservation that the expiry runner will reclaim.
      await client.rpc("delete_knowledge_source", { p_owner_id: userId, p_source_id: sourceId });
      return projectError(500, "internal_error", "Could not sign the upload.");
    }
  } catch {
    return projectError(500, "internal_error", "Could not reserve the upload.");
  }
}
