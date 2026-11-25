"use client";

import Link from "next/link";
import styles from "../../../dashboard.module.css";

export default function KnowledgeError({ reset }: { reset: () => void }) {
  return (
    <section className="glass space-y-3 rounded-2xl p-5">
      <p role="alert">Could not load knowledge sources.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={styles.secondaryButton} onClick={reset}>Try again</button>
        <Link className={styles.secondaryButton} href="/dashboard">Back to projects</Link>
      </div>
    </section>
  );
}
