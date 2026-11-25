import {
  CreateKnowledgeBodySchema,
  KnowledgeUploadUrlBodySchema,
  type ApiError,
  type CreateKnowledgeResponse,
  type FinalizeKnowledgeRequest,
  type FinalizeKnowledgeResponse,
  type KnowledgeUploadUrlResponse,
} from "@askwell/shared";

async function requireSuccess(response: Response, fallback: string) {
  if (response.ok) return response;
  const body = await response.json().catch(() => null) as ApiError | null;
  throw new Error(body?.error?.message || fallback);
}

async function post<Result>(url: string, body: object, fallback: string): Promise<Result> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await requireSuccess(response, fallback)).json();
}

export async function pasteSource(endpoint: string, title: FormDataEntryValue | null, text: FormDataEntryValue | null) {
  const input = CreateKnowledgeBodySchema.safeParse({ title, text });
  if (!input.success) throw new Error("Enter a title and text up to 1,000,000 characters.");
  return post<CreateKnowledgeResponse>(endpoint, input.data, "Could not add the source.");
}

export async function uploadSource(endpoint: string, title: FormDataEntryValue | null, file: FormDataEntryValue | null) {
  if (!(file instanceof File)) throw new Error("Choose a file to upload.");
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const contentType = extension === "pdf" ? "application/pdf" : extension === "md" ? "text/markdown" : "text/plain";
  const input = KnowledgeUploadUrlBodySchema.safeParse({
    title,
    fileName: file.name,
    sizeBytes: file.size,
    contentType,
  });
  if (!input.success) throw new Error("Enter a title and choose a non-empty PDF, Markdown, or TXT file up to 10 MB.");

  const { sourceId, signedUrl } = await post<KnowledgeUploadUrlResponse>(
    `${endpoint}/upload-url`, input.data, "Could not reserve the upload.",
  );

  const body = new FormData();
  // Match Supabase Storage's signed-upload multipart fields and normalize the file MIME type.
  body.append("cacheControl", "3600");
  body.append("", file.slice(0, file.size, contentType), file.name);
  try {
    const response = await fetch(signedUrl, { method: "PUT", body, credentials: "omit" });
    if (!response.ok) throw new Error("Storage rejected the file.");
  } catch {
    throw new Error("Could not upload the file. Delete the reserved source before trying again.");
  }

  const finalize: FinalizeKnowledgeRequest["body"] = { sourceId };
  return post<FinalizeKnowledgeResponse>(`${endpoint}/finalize`, finalize, "Could not process the uploaded file.");
}

export async function deleteSource(id: string) {
  const response = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
  if (response.status !== 404) await requireSuccess(response, "Could not delete the source.");
}
