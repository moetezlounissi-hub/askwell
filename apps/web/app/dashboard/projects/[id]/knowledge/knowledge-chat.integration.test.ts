import { createClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { createSupabasePGlite, runAs } from "../../../../../../../packages/db/supabase-pglite";
import { POST as finalize } from "../../../../api/projects/[id]/knowledge/finalize/route";
import { POST as reserve } from "../../../../api/projects/[id]/knowledge/upload-url/route";
import { POST as chat } from "../../../../api/widget/chat/route";
import { pdfFixture } from "../../../../../lib/knowledge/processing/pdf-fixture";
import { sendWidgetMessage } from "../../../../../lib/widget/embed/chat";
import { uploadSource } from "./source-requests";

const { embed, respond, protect, owner, service } = vi.hoisted(() => ({
  embed: vi.fn(), respond: vi.fn(), protect: vi.fn(), owner: vi.fn(), service: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "owner" }) }));
vi.mock("../../../../../lib/supabase/owner", () => ({ createOwnerClient: owner }));
vi.mock("../../../../../lib/supabase/service", () => ({ createServiceClient: service }));
vi.mock("../../../../../lib/arcjet", () => ({ protectWidgetChat: protect }));
vi.mock("openai", () => ({
  default: class {
    embeddings = { create: embed };
    responses = { create: respond };
  },
}));

const appOrigin = "https://app.example";
const storageOrigin = "https://storage.example";
const projectId = "00000000-0000-4000-8000-000000000001";
const endpoint = `/api/projects/${projectId}/knowledge`;
const params = Promise.resolve({ id: projectId });
const projectKey = "pk_support";
const excerpt = "Support closes at six.";
const embedding = Array<number>(1536).fill(1);
const allowed = { isDenied: () => false, isAllowed: () => true, isErrored: () => false, results: [] };

let db: Awaited<ReturnType<typeof createSupabasePGlite>>;

beforeAll(async () => {
  db = await createSupabasePGlite();
  await db.exec("insert into public.accounts (clerk_user_id) values ('owner')");
  await db.query(
    "insert into public.projects (id, owner_id, name, public_key) values ($1, 'owner', 'Support', $2)",
    [projectId, projectKey],
  );
}, 20_000);

afterAll(async () => { await db?.close(); });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

function mockOwnerClient() {
  owner.mockReturnValue({
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: () => runAs(db, "authenticated", "owner", async (tx) => ({
            data: (await tx.query("select * from public.projects where id = $1", [value])).rows[0],
            error: null,
          })),
          single: () => runAs(db, "authenticated", "owner", async (tx) => {
            expect(table).toBe("accounts");
            return {
              data: (await tx.query("select plan from public.accounts where clerk_user_id = $1", [value])).rows[0],
              error: null,
            };
          }),
        }),
      }),
    }),
  });
}

function databaseClient() {
  const postgres = createClient<Database>(storageOrigin, "test", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/)?.[1];
        return runAs(db, "service_role", undefined, async (tx) => {
          if (rpc) {
            const args: Record<string, unknown> = await request.json();
            const functions = ["reserve_knowledge_source", "claim_knowledge_upload", "match_chunks", "consume_message", "save_chat_turn"];
            if (!functions.includes(rpc)) throw new Error(`Unexpected test RPC: ${rpc}`);
            const entries = Object.entries(args);
            if (entries.some(([key]) => !/^p_[a-z_]+$/.test(key))) throw new Error("Unexpected test RPC parameter.");
            const placeholders = entries.map(([key], index) => `${key} => $${index + 1}`).join(", ");
            const values = entries.map(([key]) => args[key]);
            if (["reserve_knowledge_source", "claim_knowledge_upload", "match_chunks"].includes(rpc)) {
              const { rows } = await tx.query(`select * from public.${rpc}(${placeholders})`, values);
              return Response.json(request.headers.get("accept")?.includes("object+json") ? rows[0] : rows);
            }
            const { rows } = await tx.query<{ result: unknown }>(`select public.${rpc}(${placeholders}) as result`, values);
            return Response.json(rows[0]?.result ?? null);
          }
          if (url.pathname === "/rest/v1/projects") {
            const { rows } = await tx.query(
              "select projects.id, json_build_object('plan', accounts.plan) as accounts from public.projects join public.accounts on projects.owner_id = accounts.clerk_user_id where projects.public_key = $1",
              [url.searchParams.get("public_key")?.slice(3)],
            );
            return Response.json(rows);
          }
          if (url.pathname === "/rest/v1/knowledge_chunks" && request.method === "POST") {
            const rows: Database["public"]["Tables"]["knowledge_chunks"]["Insert"][] = await request.json();
            for (const row of rows) {
              await tx.query(
                "insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, $3, $4)",
                [row.project_id, row.source_id, row.content, row.embedding],
              );
            }
            return new Response(null, { status: 201 });
          }
          if (url.pathname === "/rest/v1/knowledge_sources" && request.method === "PATCH") {
            const { status } = await request.json();
            const { rows } = await tx.query(
              "update public.knowledge_sources set status = $1 where project_id = $2 and id = $3 and status = $4 returning *",
              [status, ...["project_id", "id", "status"].map((key) => url.searchParams.get(key)?.slice(3))],
            );
            return Response.json(rows[0]);
          }
          throw new Error(`Unexpected test request: ${request.method} ${url.pathname}`);
        });
      },
    },
  });

  return postgres;
}

it("uploads a PDF, retrieves its excerpt and persists both widget turns with mocked AI", async () => {
  mockOwnerClient();
  const postgres = databaseClient();
  const files = new Map<string, Blob>();
  service.mockReturnValue({
    from: postgres.from.bind(postgres),
    rpc: postgres.rpc.bind(postgres),
    storage: {
      from: () => ({
        createSignedUploadUrl: async (key: string) => ({
          data: { signedUrl: `${storageOrigin}/${key}?token=test` },
          error: null,
        }),
        download: async (key: string) => ({ data: files.get(key), error: null }),
      }),
    },
  });
  protect.mockResolvedValue(allowed);
  embed.mockResolvedValue({ data: [{ index: 0, embedding }] });
  respond.mockImplementation(async ({ input }: { input: string }) => {
    const { question, excerpts } = JSON.parse(input);
    expect(excerpts).toEqual([excerpt]);
    return { status: "completed", output_text: question === "When does support close?" ? excerpt : "I don't know" };
  });

  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    const url = new URL(input, appOrigin);
    const request = new Request(url, init);
    if (url.origin === storageOrigin && request.method === "PUT") {
      expect(url.searchParams.get("token")).toBe("test");
      const file = (await request.formData()).get("");
      if (!(file instanceof File)) throw new Error("Expected a multipart PDF.");
      expect(file.type).toBe("application/pdf");
      const key = url.pathname.slice(1);
      await db.query("insert into storage.objects (bucket_id, name) values ('knowledge', $1)", [key]);
      files.set(key, file);
      return new Response(null, { status: 200 });
    }
    if (url.pathname === `${endpoint}/upload-url`) return reserve(request, { params });
    if (url.pathname === `${endpoint}/finalize`) return finalize(request, { params });
    if (url.pathname === "/api/widget/chat") return chat(request);
    throw new Error(`Unexpected test request: ${url.pathname}`);
  });

  const pdf = new File([pdfFixture()], "hours.pdf", { type: "application/pdf" });
  await expect(uploadSource(endpoint, "Hours", pdf)).resolves.toMatchObject({
    source: { title: "Hours", status: "ready", type: "pdf" },
  });
  const signal = new AbortController().signal;
  const visitor = { key: projectKey, visitorId: "visitor" };
  const groundedQuestion = "When does support close?";
  const unrelatedQuestion = "How many moons does Mars have?";
  const first = await sendWidgetMessage({ ...visitor, message: groundedQuestion }, signal);
  expect(first.reply).toBe(excerpt);
  await expect(sendWidgetMessage({ ...visitor, conversationId: first.conversationId, message: unrelatedQuestion }, signal))
    .resolves.toEqual({ conversationId: first.conversationId, reply: "I don't know" });
  const { rows } = await db.query("select role, body from public.messages where conversation_id = $1", [first.conversationId]);
  expect(rows).toHaveLength(4);
  expect(rows).toEqual(expect.arrayContaining([
    { role: "visitor", body: groundedQuestion },
    { role: "bot", body: excerpt },
    { role: "visitor", body: unrelatedQuestion },
    { role: "bot", body: "I don't know" },
  ]));
});

it("returns rate_limited on the 21st widget message with isolated mocked protection", async () => {
  const key = "pk_isolated";
  await db.query("insert into public.projects (owner_id, name, public_key) values ('owner', 'Isolated', $1)", [key]);
  service.mockReturnValue(databaseClient());
  embed.mockResolvedValue({ data: [{ embedding }] });
  let conversationId: string | undefined;
  let messages = 0;
  protect.mockImplementation(async (_request: Request, projectKey: string) => {
    expect(projectKey).toBe(key);
    messages += 1;
    return messages <= 20 ? allowed : {
      isDenied: () => true, reason: { isRateLimit: () => true },
    };
  });

  for (let index = 1; index <= 21; index += 1) {
    const response = await chat(new Request(`${appOrigin}/api/widget/chat`, {
      method: "POST",
      body: JSON.stringify({ key, visitorId: "isolated", conversationId, message: `Message ${index}` }),
    }));
    if (index <= 20) {
      expect(response.status).toBe(200);
      ({ conversationId } = await response.json());
    } else {
      expect(response.status).toBe(429);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "rate_limited" } });
    }
  }
  expect(service).toHaveBeenCalledTimes(20);
});
