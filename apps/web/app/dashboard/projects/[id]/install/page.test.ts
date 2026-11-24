import { afterEach, beforeEach, expect, it, vi } from "vitest";
import InstallPage from "./page";
import { getInstallSnippet } from "./snippet";

const { protect, getOwnedProject, notFound } = vi.hoisted(() => ({
  protect: vi.fn(),
  getOwnedProject: vi.fn(),
  notFound: vi.fn((): never => { throw new Error("Not found"); }),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: { protect } }));
vi.mock("../../../../../lib/supabase/get-owned-project", () => ({ getOwnedProject }));
vi.mock("next/navigation", () => ({ notFound }));

const id = "412d3c57-5847-41f8-a920-821554278b75";
const props = { params: Promise.resolve({ id }) };

beforeEach(() => {
  vi.clearAllMocks();
  protect.mockResolvedValue({ userId: "user_verified" });
  getOwnedProject.mockResolvedValue({
    project: { name: "My project", public_key: "pk_example" },
    error: null,
  });
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com/");
});

afterEach(() => vi.unstubAllEnvs());

it("authenticates before looking up the requested project", async () => {
  await InstallPage(props);

  expect(protect).toHaveBeenCalledBefore(getOwnedProject);
  expect(getOwnedProject).toHaveBeenCalledExactlyOnceWith(id);
});

it("does not look up a project if authentication fails", async () => {
  protect.mockRejectedValueOnce(new Error("Sign-in required"));

  await expect(InstallPage(props)).rejects.toThrow("Sign-in required");
  expect(getOwnedProject).not.toHaveBeenCalled();
});

it("shows the same not-found response for missing and foreign projects", async () => {
  getOwnedProject.mockResolvedValueOnce({ project: null, error: { status: 404 } });

  await expect(InstallPage(props)).rejects.toThrow("Not found");
  expect(notFound).toHaveBeenCalledOnce();
});

it("generates a script tag with the configured origin and project public key", () => {
  expect(getInstallSnippet("https://app.example.com/", "pk_example"))
    .toBe('<script src="https://app.example.com/widget.js" data-key="pk_example"></script>');
});

it.each([undefined, "bad-url", "javascript:alert(1)", "https://user:pass@example.com"])(
  "does not generate a snippet for an invalid app URL (%s)",
  (appUrl) => expect(getInstallSnippet(appUrl, "pk_example")).toBeNull(),
);
