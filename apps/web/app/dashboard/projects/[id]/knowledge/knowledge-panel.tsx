"use client";

import type { KnowledgeSource } from "@askwell/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import styles from "../../../dashboard.module.css";
import { deleteSource, pasteSource, uploadSource } from "./source-requests";

const statusLabels = {
  uploading: "Processing",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
} satisfies Record<KnowledgeSource["status"], string>;

const typeLabels = { text: "Pasted text", pdf: "PDF", md: "Markdown", txt: "TXT" };
const field = "w-full rounded-lg border border-[var(--line)] bg-[var(--canvas)] p-2.5";

export function KnowledgePanel({ projectId, sources }: {
  projectId: string;
  sources: Pick<KnowledgeSource, "id" | "title" | "status" | "type">[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const endpoint = `/api/projects/${projectId}/knowledge`;

  function addSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setDeleting(null);
    setFeedback(null);
    startTransition(async () => {
      try {
        const { source } = mode === "paste"
          ? await pasteSource(endpoint, data.get("title"), data.get("text"))
          : await uploadSource(endpoint, data.get("title"), data.get("file"));
        form.reset();
        setFeedback(source.status === "failed"
          ? { message: "The source could not be processed. Delete it before trying again.", error: true }
          : { message: "Source added.", error: false });
      } catch (error) {
        setFeedback({ message: error instanceof Error ? error.message : "Could not add the source.", error: true });
      }
      startTransition(() => router.refresh());
    });
  }

  function confirmDelete(id: string) {
    setFeedback(null);
    startTransition(async () => {
      try {
        await deleteSource(id);
        setDeleting(null);
        setFeedback({ message: "Source deleted.", error: false });
      } catch (error) {
        setFeedback({ message: error instanceof Error ? error.message : "Could not delete the source.", error: true });
      }
      startTransition(() => router.refresh());
    });
  }

  return (
    <div className="grid gap-5">
      <form className="glass rounded-2xl p-5" onSubmit={addSource}>
        <h2 className="mb-3 font-semibold">Add a source</h2>
        <fieldset disabled={pending} className="grid min-w-0 gap-4">
          <div className="flex flex-wrap gap-4">
            <label><input type="radio" name="method" checked={mode === "paste"} onChange={() => setMode("paste")} /> Paste text</label>
            <label><input type="radio" name="method" checked={mode === "upload"} onChange={() => setMode("upload")} /> Upload a file</label>
          </div>
          <label className="grid gap-1">
            Title
            <input className={field} name="title" required maxLength={200} />
          </label>
          {mode === "paste" ? (
            <label className="grid gap-1">
              Text
              <textarea className={field} name="text" rows={5} required maxLength={1_000_000} />
            </label>
          ) : (
            <label className="grid gap-1">
              File
              <input className={`${field} min-w-0`} name="file" type="file" accept=".pdf,.md,.txt" required aria-describedby="knowledge-file-help" />
              <span id="knowledge-file-help" className="text-sm text-[var(--muted)]">PDF, Markdown, or TXT up to 10 MB.</span>
            </label>
          )}
          <button className="button button-small justify-self-start disabled:opacity-50" type="submit">Add source</button>
        </fieldset>
      </form>

      {pending && <p role="status">Updating knowledge sources…</p>}
      {feedback && <p className={styles.feedback} role={feedback.error ? "alert" : "status"}>{feedback.message}</p>}

      <section className="glass rounded-2xl p-5" aria-labelledby="knowledge-sources">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold" id="knowledge-sources">Sources</h2>
          <button type="button" className={styles.textButton} disabled={pending} onClick={() => startTransition(() => router.refresh())}>Refresh</button>
        </div>
        {sources.length === 0 ? <p>No knowledge sources yet.</p> : (
          <ul className="divide-y divide-[var(--line)]">
            {sources.map((source) => (
              <li key={source.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <p className="font-semibold">{source.title}</p>
                  <p className="text-sm text-[var(--muted)]">{typeLabels[source.type]} · {statusLabels[source.status]}</p>
                </div>
                {deleting === source.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="button button-small disabled:opacity-50" disabled={pending} onClick={() => confirmDelete(source.id)}>
                      Confirm delete
                    </button>
                    <button type="button" className={styles.textButton} disabled={pending} onClick={() => setDeleting(null)}>Cancel</button>
                  </div>
                ) : (
                  <button type="button" className={styles.textButton} disabled={pending} aria-label={`Delete ${source.title}`} onClick={() => setDeleting(source.id)}>Delete</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
