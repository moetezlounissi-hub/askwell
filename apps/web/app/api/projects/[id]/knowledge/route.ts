import { auth } from "@clerk/nextjs/server";
import { CreateKnowledgeRequestSchema, PLAN_LIMITS, type CreateKnowledgeResponse } from "@askwell/shared";
import { NextResponse } from "next/server";
import { knowledgeSourceResponse, processKnowledge } from "../../../../../lib/knowledge/processing/process";
import { projectError } from "../../../../../lib/projects/http";
import { getOwnedProject } from "../../../../../lib/supabase/get-owned-project";
import { createOwnerClient } from "../../../../../lib/supabase/owner";
import { createServiceClient } from "../../../../../lib/supabase/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return projectError(401, "unauthenticated", "Sign in to continue.");

  const input = CreateKnowledgeRequestSchema.safeParse({
    params: await params,
    query: Object.fromEntries(new URL(request.url).searchParams),
    body: await request.json().catch(() => undefined),
  });
  if (!input.success) return projectError(400, "validation_error", "Provide a valid title and text.");

  try {
    const owned = await getOwnedProject(input.data.params.id);
    if (owned.error) return owned.error;

    const { data: account, error: accountError } = await createOwnerClient()
      .from("accounts").select("plan").eq("clerk_user_id", userId).single();
    if (accountError || (account?.plan !== "free" && account?.plan !== "pro")) {
      return projectError(500, "internal_error", "Could not load your plan.");
    }

    const client = createServiceClient();
    const limit = PLAN_LIMITS[account.plan].knowledgeSources;
    const { title, text } = input.data.body;
    const { data: reservation, error } = await client.rpc("reserve_knowledge_source", {
      p_project_id: owned.project.id,
      p_owner_id: userId,
      p_title: title,
      p_type: "text",
      p_source_limit: limit,
    }).single();
    if (error?.code === "PT404") return projectError(404, "not_found", "Project not found.");
    if (error?.code === "PT409") return projectError(409, "limit_exceeded", `This project can have up to ${limit} knowledge sources.`);
    if (error || !reservation) return projectError(500, "internal_error", "Could not reserve the knowledge source.");

    const source = await processKnowledge(client, owned.project.id, reservation.source_id, async () => text);
    return NextResponse.json<CreateKnowledgeResponse>({ source: knowledgeSourceResponse(source) }, { status: 201 });
  } catch {
    return projectError(500, "internal_error", "Could not process the knowledge source.");
  }
}
