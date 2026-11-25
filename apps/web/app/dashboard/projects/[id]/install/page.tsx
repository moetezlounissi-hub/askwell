import { auth } from "@clerk/nextjs/server";
import { APP_NAME } from "@askwell/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwnedProject } from "../../../../../lib/supabase/get-owned-project";
import styles from "../../../dashboard.module.css";
import { CopySnippet } from "./copy-snippet";
import { getInstallSnippet } from "./snippet";

export const metadata: Metadata = {
  title: `Install widget · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default async function InstallPage({ params }: { params: Promise<{ id: string }> }) {
  await auth.protect();
  const { id } = await params;
  const result = await getOwnedProject(id);

  if (result.error) {
    if (result.error.status === 404) notFound();
    throw new Error("Could not load the project.");
  }

  const snippet = getInstallSnippet(process.env.NEXT_PUBLIC_APP_URL, result.project.public_key);

  return (
    <>
      <Link className={styles.secondaryButton} href="/dashboard">
        <span aria-hidden="true">←</span> Back to projects
      </Link>
      <div className={`${styles.heading} ${styles.installHeading}`}>
        <div className="min-w-0">
          <h1>Install widget</h1>
          <p>{result.project.name}</p>
        </div>
      </div>
      <section className="glass rounded-2xl p-5">
        {snippet ? (
          <>
            <ol className="list-decimal space-y-2 pl-5">
              <li>Copy the snippet below.</li>
              <li>Paste it before the closing <code>&lt;/body&gt;</code> tag on each page where you want the widget.</li>
              <li>Publish your changes and open a page to check the widget.</li>
            </ol>
            <CopySnippet snippet={snippet} />
          </>
        ) : (
          <p role="alert">The install snippet is unavailable. The app URL must be configured.</p>
        )}
      </section>
    </>
  );
}
