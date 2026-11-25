import { MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";
import { expect, it } from "vitest";
import { chunkKnowledgeText, extractKnowledgeText } from "./text";

import { pdfFixture } from "./pdf-fixture";

it("extracts text from a real PDF", async () => {
  await expect(extractKnowledgeText(pdfFixture(), "pdf")).resolves.toContain("Support closes at six.");
});

it.each(["md", "txt"] as const)("decodes UTF-8 %s without altering content", async (type) => {
  const text = "# Guide\n\nCafé 👋";
  await expect(extractKnowledgeText(new Blob([text]), type)).resolves.toBe(text);
});

it("rejects invalid PDF signatures, UTF-8, and actual file sizes", async () => {
  await expect(extractKnowledgeText(new Blob(["fake"]), "pdf")).rejects.toThrow("signature");
  await expect(extractKnowledgeText(new Blob([Uint8Array.of(0xff)]), "txt")).rejects.toThrow();
  await expect(extractKnowledgeText(new Blob([]), "md")).rejects.toThrow("size");
  await expect(extractKnowledgeText(new Blob([new Uint8Array(MAX_KNOWLEDGE_FILE_BYTES + 1)]), "pdf"))
    .rejects.toThrow("size");
});

it("normalizes whitespace and overlaps bounded chunks without splitting Unicode pairs", () => {
  expect([...chunkKnowledgeText(" \r\nPaste\ttext\0 here. ")]).toEqual(["Paste text here."]);
  expect([...chunkKnowledgeText(" \0 ")]).toEqual([]);
  const input = "a" + "😀".repeat(1800);
  const chunks = [...chunkKnowledgeText(input)];
  expect(chunks).toHaveLength(3);
  expect(chunks[0].length).toBeLessThanOrEqual(1800);
  expect(chunks.every((chunk) => !/[\uD800-\uDFFF]/u.test(chunk))).toBe(true);
  expect(chunks[1].slice(0, 200)).toBe(chunks[0].slice(-200));
  expect(chunks[0] + chunks[1].slice(200) + chunks[2].slice(200)).toBe(input);
});
