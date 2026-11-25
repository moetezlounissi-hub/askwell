import { APP_NAME } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { knowledgeSourceResponse } from "../../../../../lib/knowledge/processing/process";
import { getOwnedProject } from "../../../../../lib/supabase/get-owned-project";
import { createOwnerClient } from "../../../../../lib/supabase/owner";
import styles from "../../../dashboard.module.css";
import { KnowledgePanel } from "./knowledge-panel";

export const metadata: Metadata = {
  title: `Knowledge · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default async function KnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  await auth.protect();
  const { id } = await params;
  const owned = await getOwnedProject(id);
  if (owned.error) {
    if (owned.error.status === 404) notFound();
    throw new Error("Could not load the project.");
  }

  const { project } = owned;
  const { data, error } = await createOwnerClient()
    .from("knowledge_sources")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .order("id");
  if (error) throw new Error("Could not load knowledge sources.");

  return (
    <>
      <Link className={styles.secondaryButton} href="/dashboard">
        <span aria-hidden="true">←</span> Back to projects
      </Link>
      <div className={`${styles.heading} ${styles.installHeading}`}>
        <div className="min-w-0">
          <h1>Knowledge</h1>
          <p>{project.name}</p>
        </div>
      </div>
      <KnowledgePanel projectId={project.id} sources={data.map((row) => {
        const { id, title, status, type } = knowledgeSourceResponse(row);
        return { id, title, status, type };
      })} />
    </>
  );
}
