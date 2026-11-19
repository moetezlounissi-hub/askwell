import { UserButton } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { Brand } from "../../components/brand";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard">
      <a className="skip-link" href="#dashboard-main">
        Skip to content
      </a>
      <header className="dashboard-header">
        <Brand />
        <UserButton />
      </header>
      <div className="dashboard-grid">
        <aside className="sidebar">
          <p className="small-label">WORKSPACE</p>
          <nav aria-label="Dashboard navigation">
            <a className="nav-current" href="/dashboard" aria-current="page">
              <span aria-hidden="true">▦</span> Projects
            </a>
            <span className="nav-unavailable" aria-disabled="true">
              Billing <span className="small-label">Coming later</span>
            </span>
          </nav>
          <div className="sidebar-note">
            <span className="small-label">A CLEAR START</span>
            <p>A home for your knowledge and conversations.</p>
          </div>
        </aside>
        <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
