import type { Metadata } from "next";
import { APP_NAME } from "@askwell/shared";
import { bootstrapAccount } from "../../lib/auth/bootstrap-account";
import { listOwnerProjects } from "../../lib/projects/owner-projects";
import { createOwnerClient } from "../../lib/supabase/owner";
import { createServiceClient } from "../../lib/supabase/service";
import { ProjectsPanel } from "./_components/projects-panel";

export const metadata: Metadata = {
  title: `Projects · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default async function Dashboard() {
  await bootstrapAccount(createServiceClient);
  const client = createOwnerClient();
  const [{ data: account, error }, projects] = await Promise.all([
    client.from("accounts").select("plan").single(),
    listOwnerProjects(client),
  ]);

  if (error) {
    throw new Error("Could not load the workspace account.", { cause: error });
  }

  return (
    <>
      <div className="dashboard-title">
        <h1>Projects</h1>
        <span className="pill">{account.plan === "pro" ? "Pro" : "Free"} plan</span>
      </div>
      <ProjectsPanel initialProjects={projects} />
    </>
  );
}
