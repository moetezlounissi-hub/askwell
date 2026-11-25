import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "../../components/brand";
import styles from "./dashboard.module.css";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard">
      <a className="skip-link" href="#dashboard-main">
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Brand />
          <nav aria-label="Dashboard navigation">
            <Link className={styles.navLink} href="/dashboard">Projects</Link>
          </nav>
          <div className={styles.account}><UserButton /></div>
        </div>
      </header>
      <main id="dashboard-main" className={styles.main} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
