import "server-only";

import type { Tables } from "@askwell/db";
import type { KnowledgeSource } from "@askwell/shared";
import type { createServiceClient } from "../../supabase/service";
import { embedKnowledgeChunks } from "./embed";
import { chunkKnowledgeText } from "./text";

const batchSize = 32;

type Client = ReturnType<typeof createServiceClient>;

export function knowledgeSourceResponse(row: Tables<"knowledge_sources">): KnowledgeSource {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    type: row.type as KnowledgeSource["type"],
    storageKey: row.storage_key,
    status: row.status as KnowledgeSource["status"],
    createdAt: row.created_at,
  };
}

export async function processKnowledge(
  client: Client,
  projectId: string,
  sourceId: string,
  loadText: () => Promise<string>,
) {
  async function storeBatch(chunks: string[]) {
    const embeddings = await embedKnowledgeChunks(chunks);
    const { error } = await client.from("knowledge_chunks").insert(chunks.map((content, index) => ({
      project_id: projectId,
      source_id: sourceId,
      content,
      embedding: embeddings[index],
    })));
    if (error) throw error;
  }

  async function transition(status: "ready" | "failed") {
    const { data, error } = await client.from("knowledge_sources").update({ status })
      .eq("project_id", projectId).eq("id", sourceId).eq("status", "processing").select().single();
    if (error || !data) throw error ?? new Error("Knowledge source is no longer processing.");
    return data;
  }

  try {
    const chunks = chunkKnowledgeText(await loadText());
    let batch: string[] = [];
    let hasText = false;
    for (const chunk of chunks) {
      hasText = true;
      batch.push(chunk);
      if (batch.length === batchSize) {
        await storeBatch(batch);
        batch = [];
      }
    }
    if (!hasText) throw new Error("Knowledge source has no extractable text.");
    if (batch.length > 0) await storeBatch(batch);
    return await transition("ready");
  } catch {
    // Change status first. A lost response from a committed ready update must never
    // cause its chunks to be deleted.
    const failed = await transition("failed");
    const { error } = await client.from("knowledge_chunks").delete()
      .eq("project_id", projectId).eq("source_id", sourceId);
    if (error) throw error;
    return failed;
  }
}
