import { auth } from "@clerk/nextjs/server";
import {
  CreateProjectRequestSchema,
  ListProjectsRequestSchema,
  PLAN_LIMITS,
  type CreateProjectResponse,
  type ListProjectsResponse,
} from "@askwell/shared";
import { NextResponse } from "next/server";
import { bootstrapAccount } from "../../../lib/auth/bootstrap-account";
import { projectError } from "../../../lib/projects/http";
import { listOwnerProjects, toProject } from "../../../lib/projects/owner-projects";
import { createOwnerClient } from "../../../lib/supabase/owner";
import { createServiceClient } from "../../../lib/supabase/service";

export async function GET(request: Request) {
  if (!(await auth()).isAuthenticated) {
    return projectError(401, "unauthenticated", "Sign in to continue.");
  }
  const input = ListProjectsRequestSchema.safeParse({
    params: undefined,
    query: Object.fromEntries(new URL(request.url).searchParams),
    body: request.body === null ? undefined : null,
  });
  if (!input.success) return projectError(400, "validation_error", "Invalid project list request.");

  try {
    const projects = await listOwnerProjects(createOwnerClient());
    return NextResponse.json<ListProjectsResponse>({ projects });
  } catch {
    return projectError(500, "internal_error", "Could not load projects.");
  }
}

export async function POST(request: Request) {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) {
    return projectError(401, "unauthenticated", "Sign in to continue.");
  }
  const input = CreateProjectRequestSchema.safeParse({
    params: undefined,
    query: Object.fromEntries(new URL(request.url).searchParams),
    body: await request.json().catch(() => undefined),
  });
  if (!input.success) return projectError(400, "validation_error", "Enter a project name of 1 to 100 characters.");

  try {
    const service = createServiceClient();
    await bootstrapAccount(() => service);
    const { data: account, error: accountError } = await createOwnerClient()
      .from("accounts")
      .select("plan")
      .single();
    if (accountError || (account.plan !== "free" && account.plan !== "pro")) {
      return projectError(500, "internal_error", "Could not read your workspace plan.");
    }

    // The RPC creates the public key and default widget config atomically.
    const { data, error } = await service.rpc("create_project", {
      p_owner_id: userId,
      p_name: input.data.body.name,
      p_project_limit: PLAN_LIMITS[account.plan].projects,
    });
    if (error?.code === "PT409") {
      const limit = PLAN_LIMITS[account.plan].projects;
      return projectError(409, "limit_exceeded", `Your plan allows up to ${limit} ${limit === 1 ? "project" : "projects"}.`);
    }
    if (error || !data) return projectError(500, "internal_error", "Could not create project.");
    return NextResponse.json<CreateProjectResponse>({ project: toProject(data) }, { status: 201 });
  } catch {
    return projectError(500, "internal_error", "Could not create project.");
  }
}
