import { MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";

const chunkSize = 1800;
const overlap = 200;

export async function extractKnowledgeText(file: Blob, type: "pdf" | "md" | "txt") {
  if (file.size === 0 || file.size > MAX_KNOWLEDGE_FILE_BYTES) {
    throw new Error("Invalid knowledge file size.");
  }
  if (type !== "pdf") {
    return new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  }

  if (await file.slice(0, 5).text() !== "%PDF-") {
    throw new Error("Invalid PDF signature.");
  }
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()), { stopAtErrors: true });
  try {
    const { text } = await extractText(pdf, { mergePages: false });
    return text.join("\n\n");
  } finally {
    await pdf.destroy();
  }
}

// Each chunk stays well below the embedding token limit even with four UTF-8 bytes per character.
export function* chunkKnowledgeText(text: string) {
  const normalized = text.replaceAll("\0", "").replace(/[\uD800-\uDFFF]/gu, "\uFFFD").replace(/\s+/gu, " ").trim();
  const splitsPair = (index: number) => /[\uDC00-\uDFFF]/.test(normalized.charAt(index));
  for (let start = 0; start < normalized.length;) {
    let end = Math.min(start + chunkSize, normalized.length);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(" ", end);
      if (boundary >= end - overlap) end = boundary;
      if (splitsPair(end)) end--;
    }
    yield normalized.slice(start, end).trim();
    if (end === normalized.length) break;
    start = end - overlap;
    if (splitsPair(start)) start--;
  }
}
