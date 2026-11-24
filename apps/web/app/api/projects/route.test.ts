import { beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { DELETE, PATCH } from "./[id]/route";

const {
  auth, bootstrapAccount, getOwnedProject, rpc, single, list, update, remove, maybeSingle,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  bootstrapAccount: vi.fn(),
  getOwnedProject: vi.fn(),
  rpc: vi.fn(),
  single: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("../../../lib/auth/bootstrap-account", () => ({ bootstrapAccount }));
vi.mock("../../../lib/supabase/get-owned-project", () => ({ getOwnedProject }));
vi.mock("../../../lib/supabase/service", () => ({ createServiceClient: () => ({ rpc }) }));
vi.mock("../../../lib/supabase/owner", () => ({
  createOwnerClient: () => ({
    from: (table: string) => table === "accounts"
      ? { select: () => ({ single }) }
      : { select: () => ({ order: () => ({ order: list }) }), update, delete: remove },
  }),
}));

const row = {
  id: "412d3c57-5847-41f8-a920-821554278b75",
  owner_id: "user_verified",
  name: "My project",
  public_key: "pk_random",
  messages_used: 0,
  period_start: "2026-11-01T00:00:00+00:00",
  created_at: "2026-11-24T00:00:00+00:00",
};
const project = {
  id: row.id,
  name: row.name,
  publicKey: row.public_key,
  messagesUsed: row.messages_used,
  periodStart: row.period_start,
  createdAt: row.created_at,
};
const url = "https://example.com/api/projects";
const context = { params: Promise.resolve({ id: row.id }) };

function request(method: string, path = "", body?: object) {
  return new Request(url + path, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.mockResolvedValue({ isAuthenticated: true, userId: row.owner_id });
  single.mockResolvedValue({ data: { plan: "free" }, error: null });
  list.mockResolvedValue({ data: [row], error: null });
  rpc.mockResolvedValue({ data: row, error: null });
  getOwnedProject.mockResolvedValue({ project: row, error: null });
  const query = { eq: () => ({ select: () => ({ maybeSingle }) }) };
  update.mockReturnValue(query);
  remove.mockReturnValue(query);
});

it("returns only projects selected by the owner client, in the shared wire shape", async () => {
  const response = await GET(request("GET"));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ projects: [project] });
  expect(rpc).not.toHaveBeenCalled();
});

it("requires authentication before listing or writing projects", async () => {
  auth.mockResolvedValue({ isAuthenticated: false, userId: null });
  const responses = await Promise.all([
    GET(request("GET")),
    POST(request("POST", "", { name: "Test" })),
    PATCH(request("PATCH", `/${row.id}`, { name: "Test" }), context),
    DELETE(request("DELETE", `/${row.id}`), context),
  ]);

  expect(responses.map(({ status }) => status)).toEqual([401, 401, 401, 401]);
  expect(list).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
  expect(getOwnedProject).not.toHaveBeenCalled();
});

it.each([["free", 1], ["pro", 5]])("derives the %s creation limit server-side", async (plan, limit) => {
  single.mockResolvedValue({ data: { plan }, error: null });
  const response = await POST(request("POST", "", { name: " My project " }));

  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ project });
  expect(bootstrapAccount).toHaveBeenCalledBefore(single);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("create_project", {
    p_owner_id: row.owner_id,
    p_name: project.name,
    p_project_limit: limit,
  });
});

it("rejects attempts to override the account or plan in a create request", async () => {
  const response = await POST(request("POST", "", { name: "Test", ownerId: "other", plan: "pro" }));

  expect(response.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

it("reports an atomic limit refusal as a conflict", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "PT409" } });

  const response = await POST(request("POST", "", { name: "Second" }));

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: { code: "limit_exceeded", message: "Your plan allows up to 1 project." },
  });
});

it("updates only the project name through the owner client", async () => {
  const name = "Renamed";
  maybeSingle.mockResolvedValue({ data: { ...row, name }, error: null });

  const response = await PATCH(request("PATCH", `/${row.id}`, { name }), context);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ project: { ...project, name } });
  expect(getOwnedProject).toHaveBeenCalledBefore(update);
  expect(update).toHaveBeenCalledExactlyOnceWith({ name });
});

it.each([undefined, ""])("deletes an owned project with an empty body (%s)", async (body) => {
  maybeSingle.mockResolvedValue({ data: { id: row.id }, error: null });

  const response = await DELETE(new Request(`${url}/${row.id}`, { method: "DELETE", body }), context);

  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
  expect(getOwnedProject).toHaveBeenCalledBefore(remove);
});

it.each([
  ["JSON", "{}"],
  ["UTF-8 BOM", "\uFEFF"],
])("rejects a delete with a %s body before checking ownership", async (_label, body) => {
  const response = await DELETE(new Request(`${url}/${row.id}`, { method: "DELETE", body }), context);

  expect(response.status).toBe(400);
  expect(getOwnedProject).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

it("rejects a delete without waiting for the stream to close after receiving a byte", async () => {
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(0));
      controller.enqueue(Uint8Array.of(1));
    },
    cancel,
  });
  const init = { method: "DELETE", body, duplex: "half" };

  const response = await DELETE(new Request(`${url}/${row.id}`, init), context);

  expect(response.status).toBe(400);
  expect(cancel).toHaveBeenCalledOnce();
  expect(getOwnedProject).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

it("returns the same ownership error for missing or foreign projects without writing", async () => {
  getOwnedProject.mockImplementation(() =>
    Promise.resolve({ project: null, error: new Response(null, { status: 404 }) }),
  );
  const patch = await PATCH(request("PATCH", `/${row.id}`, { name: "Test" }), context);
  const removeResponse = await DELETE(request("DELETE", `/${row.id}`), context);

  expect([patch.status, removeResponse.status]).toEqual([404, 404]);
  expect(update).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});
