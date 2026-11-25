import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createSupabasePGlite, runAs } from "../../../../../packages/db/supabase-pglite";
import type { Database } from "@askwell/db";
import type { createServiceClient } from "../../supabase/service";
import { runChatTurn } from "./turn";

const { embed, respond } = vi.hoisted(() => ({ embed: vi.fn(), respond: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("openai", () => ({
  default: class {
    embeddings = { create: embed };
    responses = { create: respond };
  },
}));

const project = "00000000-0000-4000-8000-000000000001";
const source = "00000000-0000-4000-8000-000000000002";
const embedding = Array<number>(1536).fill(1);
const excerpt = "The Kestrel help desk closes at 6:37 PM UTC on Fridays.";
let db: Awaited<ReturnType<typeof createSupabasePGlite>>;

beforeAll(async () => {
  db = await createSupabasePGlite();
  await db.exec("insert into public.accounts (clerk_user_id) values ('owner')");
  await db.query(
    "insert into public.projects (id, owner_id, name, public_key) values ($1, 'owner', 'Kestrel', 'pk_kestrel')",
    [project],
  );
  await db.query(
    "insert into public.knowledge_sources (id, project_id, title, type, status) values ($1, $2, 'Hours', 'text', 'ready')",
    [source, project],
  );
  await db.query(
    "insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, $3, $4)",
    [project, source, excerpt, JSON.stringify(embedding)],
  );
}, 20_000);

afterAll(async () => {
  await db?.close();
});

type Functions = Database["public"]["Functions"];
type ChatFunction = "consume_message" | "match_chunks" | "save_chat_turn";

function rpc<Name extends ChatFunction>(name: Name, args: Functions[Name]["Args"]) {
  // Adapt the PostgREST call shape to the same migrated functions in local Postgres.
  const entries = Object.entries(args).filter(([, value]) => value !== undefined);
  const parameters = entries.map(([key], index) => `${key} => $${index + 1}`).join(", ");
  const call = `public.${name}(${parameters})`;
  return runAs(db, "service_role", undefined, async (tx) => {
    const values = entries.map(([, value]) => value);
    if (name === "match_chunks") {
      const { rows } = await tx.query(`select * from ${call}`, values);
      return { data: rows, error: null };
    }
    const { rows } = await tx.query<{ result: unknown }>(`select ${call} as result`, values);
    return { data: rows[0]?.result, error: null };
  });
}

it("grounds a mocked reply in a seeded excerpt and saves it with the unrelated-question fallback", async () => {
  const client = { rpc } as unknown as ReturnType<typeof createServiceClient>;
  const visitor = { key: "pk_kestrel", visitorId: "visitor" };
  const groundedQuestion = "When does the Kestrel help desk close on Fridays?";
  const unrelatedQuestion = "What is the orbital period of Neptune?";
  const fallback = "I don't know";

  embed.mockResolvedValue({ data: [{ embedding }] });
  respond.mockResolvedValueOnce({ status: "completed", output_text: excerpt });
  respond.mockResolvedValueOnce({ status: "completed", output_text: fallback });

  const grounded = await runChatTurn(client, project, "free", { ...visitor, message: groundedQuestion });
  expect(grounded).toMatchObject({ status: "ok", response: { reply: excerpt } });
  if (grounded.status !== "ok") throw new Error("Expected the first turn to create a conversation");
  const { conversationId } = grounded.response;

  await expect(runChatTurn(client, project, "free", {
    ...visitor, message: unrelatedQuestion, conversationId,
  })).resolves.toEqual({ status: "ok", response: { conversationId, reply: fallback } });

  for (const [index, question] of [groundedQuestion, unrelatedQuestion].entries()) {
    expect(embed).toHaveBeenNthCalledWith(index + 1, expect.objectContaining({ input: question }));
    expect(respond).toHaveBeenNthCalledWith(index + 1, expect.objectContaining({
      instructions: expect.stringContaining("reply exactly: I don't know"),
      input: JSON.stringify({ question, excerpts: [excerpt] }),
    }));
  }
  expect((await db.query("select id, visitor_id from public.conversations where project_id = $1", [project])).rows)
    .toEqual([{ id: conversationId, visitor_id: visitor.visitorId }]);
  expect((await db.query("select role, body from public.messages where conversation_id = $1", [conversationId])).rows)
    .toEqual(expect.arrayContaining([
      { role: "visitor", body: groundedQuestion },
      { role: "bot", body: excerpt },
      { role: "visitor", body: unrelatedQuestion },
      { role: "bot", body: fallback },
    ]));
  expect((await db.query("select count(*)::integer as count from public.messages")).rows).toEqual([{ count: 4 }]);
  expect((await db.query("select messages_used from public.projects where id = $1", [project])).rows)
    .toEqual([{ messages_used: 2 }]);
});
