"use client";

import Link from "next/link";

export default function DashboardError({ retry }: { retry: () => void }) {
  return (
    <section className="empty-state glass" role="alert">
      <p className="eyebrow">LET&apos;S TRY THAT AGAIN</p>
      <h2>We couldn&apos;t load this page.</h2>
      <p>Try again to return to your workspace.</p>
      <button className="button" onClick={() => retry()}>
        Try again
      </button>
      <Link className="text-link" href="/">
        Back to home
      </Link>
    </section>
  );
}
