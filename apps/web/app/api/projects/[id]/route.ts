import { auth } from "@clerk/nextjs/server";
import { DeleteProjectRequestSchema, UpdateProjectRequestSchema, type UpdateProjectResponse } from "@askwell/shared";
import { NextResponse } from "next/server";
import { projectError } from "../../../../lib/projects/http";
import { toProject } from "../../../../lib/projects/owner-projects";
import { getOwnedProject } from "../../../../lib/supabase/get-owned-project";
import { createOwnerClient } from "../../../../lib/supabase/owner";

type ProjectContext = { params: Promise<{ id: string }> };

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

export async function PATCH(request: Request, { params }: ProjectContext) {
  if (!(await auth()).isAuthenticated) {
    return projectError(401, "unauthenticated", "Sign in to continue.");
  }
  const input = UpdateProjectRequestSchema.safeParse({
    params: await params,
    query: Object.fromEntries(new URL(request.url).searchParams),
    body: await request.json().catch(() => undefined),
  });
  if (!input.success) return projectError(400, "validation_error", "Provide a valid project ID and name of 1 to 100 characters.");

  try {
    const owned = await getOwnedProject(input.data.params.id);
    if (owned.error) return owned.error;
    const { data, error } = await createOwnerClient()
      .from("projects")
      .update({ name: input.data.body.name })
      .eq("id", owned.project.id)
      .select()
      .maybeSingle();
    if (error) return projectError(500, "internal_error", "Could not rename project.");
    if (!data) return projectError(404, "not_found", "Project not found.");
    return NextResponse.json<UpdateProjectResponse>({ project: toProject(data) });
  } catch {
    return projectError(500, "internal_error", "Could not rename project.");
  }
}

export async function DELETE(request: Request, { params }: ProjectContext) {
  if (!(await auth()).isAuthenticated) {
    return projectError(401, "unauthenticated", "Sign in to continue.");
  }
  // A deployment adapter can expose an empty DELETE body as a stream.
  const emptyBody = await isEmptyBody(request.body).catch(() => false);
  const input = DeleteProjectRequestSchema.safeParse({
    params: await params,
    query: Object.fromEntries(new URL(request.url).searchParams),
    body: emptyBody ? undefined : null,
  });
  if (!input.success) return projectError(400, "validation_error", "Invalid project deletion request.");

  try {
    const owned = await getOwnedProject(input.data.params.id);
    if (owned.error) return owned.error;
    const { data, error } = await createOwnerClient()
      .from("projects")
      .delete()
      .eq("id", owned.project.id)
      .select("id")
      .maybeSingle();
    if (error) return projectError(500, "internal_error", "Could not delete project.");
    if (!data) return projectError(404, "not_found", "Project not found.");
    return new Response(null, { status: 204 });
  } catch {
    return projectError(500, "internal_error", "Could not delete project.");
  }
}
