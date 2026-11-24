"use client";

import type { ApiError, CreateProjectResponse, Project, UpdateProjectResponse } from "@askwell/shared";
import Link from "next/link";
import { useState, type FormEvent } from "react";

type Operation = "create" | "rename" | "delete";

export function ProjectsPanel({ initialProjects }: { initialProjects: Project[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pending, setPending] = useState<Operation | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);

  async function mutate(operation: Operation, projectId?: string, name?: FormDataEntryValue | null) {
    setPending(operation);
    setFeedback(null);
    try {
      const response = await fetch(projectId ? `/api/projects/${encodeURIComponent(projectId)}` : "/api/projects", {
        method: { create: "POST", rename: "PATCH", delete: "DELETE" }[operation],
        ...(operation === "delete" ? {} : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }),
      });

      if (!response.ok) {
        const result: ApiError | null = await response.json().catch(() => null);
        throw new Error(result?.error?.message ?? "Could not save changes. Try again.");
      }

      if (operation === "delete") {
        setProjects((current) => current.filter((project) => project.id !== projectId));
      } else {
        const { project }: CreateProjectResponse | UpdateProjectResponse = await response.json();
        setProjects((current) =>
          operation === "create"
            ? [project, ...current]
            : current.map((item) => item.id === project.id ? project : item),
        );
      }
      setEditing(null);
      setDeleting(null);
      setFeedback({ text: { create: "Project created.", rename: "Project renamed.", delete: "Project deleted." }[operation], error: false });
      return true;
    } catch (error) {
      setFeedback({
        text: error instanceof Error ? error.message : "Could not save changes. Try again.",
        error: true,
      });
      return false;
    } finally {
      setPending(null);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await mutate("create", undefined, new FormData(form).get("name"))) form.reset();
  }

  return (
    <section aria-label="Manage projects" aria-busy={pending !== null}>
      <form className="glass mb-5 rounded-2xl p-5" onSubmit={create}>
        <label htmlFor="new-project-name" className="block font-semibold">Project name</label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input id="new-project-name" name="name" required maxLength={100}
            className="min-w-0 flex-1 rounded-lg border border-black/25 bg-white px-3 py-2" />
          <button className="button button-small disabled:opacity-50" disabled={pending !== null}>
            {pending === "create" ? "Creating…" : "Create project"}
          </button>
        </div>
      </form>
      {feedback && <p className="mb-4 font-medium" role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
      {projects.length === 0 ? (
        <div className="empty-state glass">
          <h2>No projects yet</h2>
          <p>Create your first project to start setting up your support widget.</p>
        </div>
      ) : (
        <ul className="grid gap-3" aria-label="Your projects">
          {projects.map((project) => (
            <li key={project.id} className="glass rounded-2xl p-5">
              <h2 className="mb-3 break-words text-lg font-semibold">{project.name}</h2>
              {editing === project.id ? (
                <form onSubmit={(event) => {
                  event.preventDefault();
                  void mutate("rename", project.id, new FormData(event.currentTarget).get("name"));
                }}>
                  <label htmlFor={`name-${project.id}`} className="block font-semibold">New project name</label>
                  <input id={`name-${project.id}`} name="name" defaultValue={project.name} required maxLength={100}
                    className="my-2 w-full rounded-lg border border-black/25 bg-white px-3 py-2" />
                  <div className="flex flex-wrap gap-3">
                    <button className="button button-small disabled:opacity-50" disabled={pending !== null}>
                      {pending === "rename" ? "Saving…" : "Save name"}
                    </button>
                    <button type="button" className="underline" disabled={pending !== null} onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </form>
              ) : deleting === project.id ? (
                <>
                  <p className="mb-3">Permanently delete this project and its data?</p>
                  <div className="flex flex-wrap gap-3">
                    <button className="button button-small disabled:opacity-50" disabled={pending !== null} onClick={() => void mutate("delete", project.id)}>
                      {pending === "delete" ? "Deleting…" : "Delete project"}
                    </button>
                    <button className="underline" disabled={pending !== null} onClick={() => setDeleting(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-4">
                  <Link className="underline" href={`/dashboard/projects/${project.id}/install`} aria-label={`Install widget for ${project.name}`}>
                    Install
                  </Link>
                  <button className="underline disabled:opacity-50" aria-label={`Rename ${project.name}`} disabled={pending !== null} onClick={() => { setDeleting(null); setEditing(project.id); }}>Rename</button>
                  <button className="underline disabled:opacity-50" aria-label={`Delete ${project.name}`} disabled={pending !== null} onClick={() => { setEditing(null); setDeleting(project.id); }}>Delete</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
