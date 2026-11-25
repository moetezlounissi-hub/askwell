import styles from "./dashboard.module.css";

export default function Loading() {
  return (
    <section className={styles.routeState} role="status">
      <span className={styles.loadingMark} aria-hidden="true" />
      <h2>Loading your workspace…</h2>
    </section>
  );
}
