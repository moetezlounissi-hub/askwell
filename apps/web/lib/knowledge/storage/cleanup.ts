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
