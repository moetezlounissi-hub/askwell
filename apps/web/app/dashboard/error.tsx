"use client";

import Link from "next/link";
import styles from "./dashboard.module.css";

export default function DashboardError({ retry }: { retry: () => void }) {
  return (
    <section className={styles.routeState} role="alert">
      <h2>We couldn&apos;t load this page.</h2>
      <div className={styles.stateActions}>
        <button type="button" className={styles.actionButton} onClick={retry}>Try again</button>
        <Link className={styles.secondaryButton} href="/">Back to home</Link>
      </div>
    </section>
  );
}
