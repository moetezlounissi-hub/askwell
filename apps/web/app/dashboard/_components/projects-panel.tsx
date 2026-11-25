"use client";

import type { ApiError, CreateProjectResponse, Project, UpdateProjectResponse } from "@askwell/shared";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import styles from "../dashboard.module.css";

type Operation = "create" | "rename" | "delete";

export function ProjectsPanel({ initialProjects }: { initialProjects: Project[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pending, setPending] = useState<Operation | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean; operation: Operation; projectId?: string } | null>(null);

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

      let savedProjectId = projectId;
      if (operation === "delete") {
        setProjects((current) => current.filter((project) => project.id !== projectId));
      } else {
        const { project }: CreateProjectResponse | UpdateProjectResponse = await response.json();
        savedProjectId = project.id;
        setProjects((current) =>
          operation === "create"
            ? [project, ...current]
            : current.map((item) => item.id === project.id ? project : item),
        );
      }
      setEditing(null);
      setDeleting(null);
      setFeedback({
        text: { create: "Project created.", rename: "Project renamed.", delete: "Project deleted." }[operation],
        error: false,
        operation,
        projectId: savedProjectId,
      });
      return true;
    } catch (error) {
      setFeedback({
        text: error instanceof Error ? error.message : "Could not save changes. Try again.",
        error: true,
        operation,
        projectId,
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
    <div className={styles.workspace}>
      <section aria-labelledby="project-list-title">
        <header className={styles.listHeading}>
          <h2 id="project-list-title">Your projects</h2>
          <span>{projects.length} {projects.length === 1 ? "project" : "projects"}</span>
        </header>
        {feedback && !feedback.error && feedback.operation !== "create" && (
          <p className={styles.feedback} role="status">{feedback.text}</p>
        )}
        {projects.length === 0 ? (
          <div className={`glass ${styles.empty}`}>
            <span className={styles.projectIcon} aria-hidden="true">
              <ProjectIcon />
            </span>
            <h3>No projects yet</h3>
            <p>Create a project to get the install code for your first support widget.</p>
          </div>
        ) : (
          <ul className={styles.cards}>
            {projects.map((project) => (
              <li key={project.id} className={`glass ${styles.card}`}>
                <div className={styles.cardHeading}>
                  <span className={styles.projectIcon} aria-hidden="true"><ProjectIcon /></span>
                  <h3>{project.name}</h3>
                </div>
                {editing === project.id ? (
                  <form className={styles.cardEditor} onSubmit={(event) => {
                    event.preventDefault();
                    void mutate("rename", project.id, new FormData(event.currentTarget).get("name"));
                  }}>
                    <label htmlFor={`name-${project.id}`} className="block font-semibold">New project name</label>
                    <input id={`name-${project.id}`} name="name" defaultValue={project.name} required maxLength={100}
                      className={styles.input} disabled={pending !== null} />
                    <div className="flex flex-wrap gap-3">
                      <button className="button button-small disabled:opacity-50" disabled={pending !== null}>
                        {pending === "rename" ? "Saving…" : "Save name"}
                      </button>
                      <button type="button" className={styles.textButton} disabled={pending !== null} onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </form>
                ) : deleting === project.id ? (
                  <>
                    <p className="mt-4 mb-3">Permanently delete this project and its data?</p>
                    <div className="flex flex-wrap gap-3">
                      <button className="button button-small disabled:opacity-50" disabled={pending !== null} onClick={() => void mutate("delete", project.id)}>
                        {pending === "delete" ? "Deleting…" : "Delete project"}
                      </button>
                      <button className={styles.textButton} disabled={pending !== null} onClick={() => setDeleting(null)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <div className={styles.cardActions}>
                    <Link className={styles.secondaryButton} href={`/dashboard/projects/${project.id}/knowledge`} aria-label={`Manage knowledge for ${project.name}`}>
                      Knowledge
                    </Link>
                    <Link className={styles.secondaryButton} href={`/dashboard/projects/${project.id}/install`} aria-label={`Install widget for ${project.name}`}>
                      Install widget <span aria-hidden="true">→</span>
                    </Link>
                    <button className={styles.textButton} aria-label={`Rename ${project.name}`} disabled={pending !== null} onClick={() => { setDeleting(null); setEditing(project.id); }}>Rename</button>
                    <button className={styles.textButton} aria-label={`Delete ${project.name}`} disabled={pending !== null} onClick={() => { setEditing(null); setDeleting(project.id); }}>Delete</button>
                  </div>
                )}
                {feedback?.error && feedback.projectId === project.id && (
                  <p className={styles.feedback} role="alert">{feedback.text}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`glass ${styles.createPanel}`} aria-labelledby="create-project-title">
        <h2 id="create-project-title">Create a project</h2>
        <p>Give your project a name you’ll recognize.</p>
        <form onSubmit={create}>
          <label htmlFor="new-project-name">Project name</label>
          <input id="new-project-name" name="name" required maxLength={100} pattern={String.raw`.*\S.*`}
            placeholder="e.g. Acme Help Center" aria-describedby="project-name-help" title="Enter a name with at least one non-space character."
            disabled={pending !== null} className={styles.input} />
          <p id="project-name-help" className={styles.fieldHelp}>Enter up to 100 characters.</p>
          <button className={styles.primaryButton} disabled={pending !== null}>
            <span aria-hidden="true">+</span>
            {pending === "create" ? "Creating…" : "Create project"}
          </button>
        </form>
        {feedback?.operation === "create" && (
          <div className={styles.createFeedback}>
            <p className={styles.feedback} role={feedback.error ? "alert" : "status"}>{feedback.text}</p>
            {!feedback.error && feedback.projectId && (
              <Link className={styles.secondaryButton} href={`/dashboard/projects/${feedback.projectId}/install`}>
                Continue to installation <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M3 8h18M8 21h8m-4-3v3" strokeLinecap="round" />
    </svg>
  );
}
