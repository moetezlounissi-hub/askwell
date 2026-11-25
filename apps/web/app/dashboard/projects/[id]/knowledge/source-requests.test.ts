import { afterEach, expect, it, vi } from "vitest";
import { deleteSource, pasteSource, uploadSource } from "./source-requests";

const endpoint = "/api/projects/project/knowledge";
afterEach(() => vi.unstubAllGlobals());

it("validates input before reserving a source or uploading bytes", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(pasteSource(endpoint, "Title", " ")).rejects.toThrow("Enter a title and text");
  await expect(uploadSource(endpoint, "Title", new File(["x"], "guide.zip"))).rejects.toThrow("choose a non-empty PDF");
  expect(fetch).not.toHaveBeenCalled();
});

it("pastes text and reports server limits", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ source: { status: "ready" } }))
    .mockResolvedValueOnce(Response.json({ error: { message: "Source limit reached." } }, { status: 409 }));
  vi.stubGlobal("fetch", fetch);
  await expect(pasteSource(endpoint, " Guide ", " Details ")).resolves.toMatchObject({ source: { status: "ready" } });
  expect(fetch).toHaveBeenCalledWith(endpoint, expect.objectContaining({
    method: "POST", body: JSON.stringify({ title: "Guide", text: " Details " }),
  }));
  await expect(pasteSource(endpoint, "Guide", "Details")).rejects.toThrow("Source limit reached.");
});

it("puts a file directly to the signed URL before finalizing", async () => {
  const signedUrl = "https://storage.example/knowledge/file.pdf?token=test";
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ sourceId: "source", signedUrl }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(Response.json({ source: { status: "ready" } }));
  vi.stubGlobal("fetch", fetch);

  const file = new File(["mock PDF"], "Guide.PDF", { type: "application/octet-stream" });
  await expect(uploadSource(endpoint, "Guide", file)).resolves.toMatchObject({ source: { status: "ready" } });
  expect(fetch).toHaveBeenNthCalledWith(1, `${endpoint}/upload-url`, expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ title: "Guide", fileName: "Guide.PDF", contentType: "application/pdf", sizeBytes: file.size }),
  }));
  expect(fetch).toHaveBeenNthCalledWith(2, signedUrl, expect.objectContaining({ method: "PUT", credentials: "omit" }));
  const uploaded = fetch.mock.calls[1]?.[1].body.get("") as File;
  expect(uploaded.type).toBe("application/pdf");
  expect(await uploaded.text()).toBe("mock PDF");
  expect(fetch).toHaveBeenNthCalledWith(3, `${endpoint}/finalize`, expect.objectContaining({
    method: "POST", body: JSON.stringify({ sourceId: "source" }),
  }));
});

it("skips finalization after a storage rejection", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ sourceId: "source", signedUrl: "https://storage.example/signed" }))
    .mockResolvedValueOnce(new Response(null, { status: 400 }));
  vi.stubGlobal("fetch", fetch);
  await expect(uploadSource(endpoint, "Guide", new File(["text"], "guide.txt"))).rejects.toThrow("Could not upload the file");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("treats an already removed source as deleted and surfaces other failures", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(null, { status: 500 }));
  vi.stubGlobal("fetch", fetch);
  await expect(deleteSource("source")).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledWith("/api/knowledge/source", { method: "DELETE" });
  await expect(deleteSource("source")).rejects.toThrow("Could not delete the source");
});
