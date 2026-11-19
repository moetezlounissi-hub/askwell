import "server-only";

import type { Tables } from "@askwell/db";
import { IdParamsSchema, type ApiError } from "@askwell/shared";
import { NextResponse } from "next/server";
import { createOwnerClient } from "./owner";

type OwnedProjectResult =
  | { project: Tables<"projects">; error: null }
  | { project: null; error: NextResponse<ApiError> };

function projectNotFound(): OwnedProjectResult {
  return {
    project: null,
    error: NextResponse.json<ApiError>(
      { error: { code: "not_found", message: "Project not found." } },
      { status: 404 },
    ),
  };
}

export async function getOwnedProject(projectId: string): Promise<OwnedProjectResult> {
  if (!IdParamsSchema.safeParse({ id: projectId }).success) {
    return projectNotFound();
  }

  const { data: project, error } = await createOwnerClient()
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    return {
      project: null,
      error: NextResponse.json<ApiError>(
        { error: { code: "internal_error", message: "Could not load project." } },
        { status: 500 },
      ),
    };
  }

  return project ? { project, error: null } : projectNotFound();
}
