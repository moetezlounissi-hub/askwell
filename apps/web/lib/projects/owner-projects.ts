import "server-only";

import type { Tables } from "@askwell/db";
import type { Project } from "@askwell/shared";
import { createOwnerClient } from "../supabase/owner";

export function toProject(row: Tables<"projects">): Project {
  return {
    id: row.id,
    name: row.name,
    publicKey: row.public_key,
    messagesUsed: row.messages_used,
    periodStart: row.period_start,
    createdAt: row.created_at,
  };
}

export async function listOwnerProjects(client: ReturnType<typeof createOwnerClient>) {
  const { data, error } = await client
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id");

  if (error) throw new Error("Could not load projects.", { cause: error });
  return data.map(toProject);
}
