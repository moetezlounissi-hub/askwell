import "server-only";

import type { createServiceClient } from "../../supabase/service";

export const KNOWLEDGE_BUCKET = "knowledge";

export async function removeKnowledgeFile(
  client: ReturnType<typeof createServiceClient>,
  storageKey: string,
) {
  const { error } = await client.storage.from(KNOWLEDGE_BUCKET).remove([storageKey]);
  if (error) throw error;

  const { error: ledgerError } = await client.rpc("complete_knowledge_cleanup", {
    p_storage_key: storageKey,
  });
  if (ledgerError) throw ledgerError;
}

export async function runKnowledgeCleanup(client: ReturnType<typeof createServiceClient>) {
  const { data: pending, error } = await client.rpc("collect_knowledge_cleanup");
  if (error) throw error;

  let removed = 0;
  let failed = 0;
  for (const { storage_key } of pending) {
    try {
      await removeKnowledgeFile(client, storage_key);
      removed++;
    } catch {
      failed++;
    }
  }
  return { removed, failed };
}
