export default function Loading() {
  return (
    <section className="empty-state glass" role="status" aria-live="polite">
      <span className="loading-line" aria-hidden="true" />
      <h2>Loading your workspace…</h2>
      <p>Getting everything in place.</p>
    </section>
  );
}
