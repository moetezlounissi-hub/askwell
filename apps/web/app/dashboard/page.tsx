import type { Metadata } from "next";
import { APP_NAME } from "@askwell/shared";

export const metadata: Metadata = {
  title: `Projects · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default function Dashboard() {
  return (
    <>
      <div className="dashboard-title">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>Projects</h1>
        </div>
        <span className="pill">Getting started</span>
      </div>
      <p className="workspace-notice">
        This is a static workspace preview. Sign-in and project management are
        coming next; no account data is shown.
      </p>
      <section className="empty-state glass" aria-labelledby="empty-title">
        <span className="empty-icon" aria-hidden="true">
          ＋
        </span>
        <p className="eyebrow">A FRESH PAGE</p>
        <h2 id="empty-title">Your first project starts here.</h2>
        <p>
          A project brings your knowledge, widget and visitor conversations
          together.
        </p>
        <span className="unavailable-action">Project creation coming soon</span>
      </section>
      <div className="dashboard-next">
        <p className="small-label">WHAT COMES NEXT</p>
        <ol>
          <li>
            <span>01</span> Create a project
          </li>
          <li>
            <span>02</span> Add your knowledge
          </li>
          <li>
            <span>03</span> Install your widget
          </li>
        </ol>
      </div>
    </>
  );
}
