import "server-only";

import OpenAI from "openai";

const dimensions = 1536;

export async function embedKnowledgeChunks(chunks: string[]) {
  const client = new OpenAI({ timeout: 15_000, maxRetries: 0 });
  const result = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: chunks,
    dimensions,
    encoding_format: "float",
  });
  const vectors = new Map(result.data.map(({ index, embedding }) => [index, embedding]));
  if (result.data.length !== chunks.length) throw new Error("Unexpected embedding count.");
  return chunks.map((_, index) => {
    const vector = vectors.get(index);
    if (vector?.length !== dimensions || !vector.every(Number.isFinite)) {
      throw new Error("Invalid knowledge embedding.");
    }
    return JSON.stringify(vector);
  });
}
