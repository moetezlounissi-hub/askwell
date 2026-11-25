import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PLAN_LIMITS } from "../shared/src/plans";
import { createSupabasePGlite, runAs } from "./supabase-pglite";

const owner = "user_alpha";
const otherOwner = "user_beta";
const project = "00000000-0000-4000-8000-000000000001";
const otherProject = "00000000-0000-4000-8000-000000000002";
const foreignConversation = "00000000-0000-4000-8000-000000000003";
const limit = PLAN_LIMITS.free;
let db: PGlite;

beforeAll(async () => {
  db = await createSupabasePGlite();
}, 20_000);

beforeEach(async () => {
  await db.exec("truncate public.accounts cascade");
  await db.query("insert into public.accounts (clerk_user_id) values ($1), ($2)", [owner, otherOwner]);
});

afterAll(async () => {
  await db?.close();
});

async function seedProjects() {
  await db.query(
    "insert into public.projects (id, owner_id, name, public_key) values ($1, $2, 'Alpha', 'pk_alpha'), ($3, $4, 'Beta', 'pk_beta')",
    [project, owner, otherProject, otherOwner],
  );
}

function service<T>(sql: string, parameters: unknown[] = []) {
  return runAs(db, "service_role", undefined, (tx) => tx.query<T>(sql, parameters));
}

function expectLastSlot(results: PromiseSettledResult<unknown>[], code: string) {
  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(results.filter(({ status }) => status === "rejected")).toEqual([
    { status: "rejected", reason: expect.objectContaining({ code }) },
  ]);
}

it("grants execution only to the intended roles and pins invoker search paths", async () => {
  const { rows } = await db.query(`
    select p.proname, p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    order by p.proname
  `);
  expect(rows).toEqual([
    "claim_knowledge_upload", "collect_knowledge_cleanup", "complete_knowledge_cleanup",
    "consume_message", "create_project", "delete_knowledge_source", "match_chunks",
    "owner_activity", "reserve_knowledge_source", "save_chat_turn",
  ].map((proname) => ({
    proname, prosecdef: false, proconfig: ['search_path=""'], anon: false,
    authenticated: proname === "owner_activity",
    service_role: proname !== "owner_activity",
  })));
  await expect(runAs(db, "authenticated", owner, (tx) =>
    tx.query("select public.consume_message($1, $2)", [project, limit.messagesPerMonth]),
  )).rejects.toMatchObject({ code: "42501" });
  await expect(runAs(db, "anon", undefined, (tx) =>
    tx.query("select * from public.owner_activity()"),
  )).rejects.toMatchObject({ code: "42501" });
});

it("admits one caller for the last project slot and creates the widget config", async () => {
  const outcomes = await Promise.allSettled(["First", "Second"].map((name) =>
    service("select * from public.create_project($1, $2, $3)", [owner, name, limit.projects]),
  ));
  expectLastSlot(outcomes, "PT409");
  const { rows } = await db.query(`
    select p.public_key, w.label, w.show_badge
    from public.projects p join public.widget_configs w on w.project_id = p.id
  `);
  expect(rows).toEqual([{ public_key: expect.stringMatching(/^pk_[0-9a-f]{32}$/), label: "Ask us", show_badge: true }]);
});

it("rolls back the project if inserting the default widget config fails", async () => {
  const rollback = new Error("rollback widget failure fixture");
  await expect(db.transaction(async (tx) => {
    // The conditional constraint exists only within this rolled-back test fixture.
    await tx.exec("alter table public.widget_configs add check (not show_badge)");
    await tx.exec("set local role service_role");
    await tx.exec("savepoint before_create");
    await expect(tx.query("select public.create_project($1, 'First', $2)", [owner, limit.projects]))
      .rejects.toMatchObject({ code: "23514" });
    await tx.exec("rollback to before_create");
    const { rows } = await tx.query("select id from public.projects");
    expect(rows).toEqual([]);
    throw rollback;
  })).rejects.toBe(rollback);
});

it("reclaims only expired uploads and admits one caller for the last source slot", async () => {
  await seedProjects();
  await db.query(`
    insert into public.knowledge_sources (project_id, title, type, status, storage_key, created_at)
    values
      ($1, 'Old upload', 'pdf', 'uploading', 'old.pdf', now() - interval '2 hours'),
      ($1, 'Old processing', 'pdf', 'processing', 'processing.pdf', now() - interval '3 hours'),
      ($1, 'Current upload', 'pdf', 'uploading', 'current.pdf', now()),
      ($2, 'Other old upload', 'pdf', 'uploading', 'other.pdf', now() - interval '3 hours')
  `, [project, otherProject]);

  const sql = "select * from public.reserve_knowledge_source($1, $2, $3, $4, $5, $6)";
  await expect(service(sql, [project, otherOwner, "Foreign", "pdf", limit.knowledgeSources, "foreign.pdf"]))
    .rejects.toMatchObject({ code: "PT404" });
  const outcomes = await Promise.allSettled([
    service(sql, [project, owner, "New file", "pdf", limit.knowledgeSources, "new.pdf"]),
    service(sql, [project, owner, "Pasted text", "text", limit.knowledgeSources, null]),
  ]);
  expectLastSlot(outcomes, "PT409");
  const winner = outcomes.find((result) => result.status === "fulfilled");
  expect(winner?.value.rows).toEqual([{ source_id: expect.any(String), reclaimed_storage_keys: ["old.pdf"] }]);
  const { rows } = await db.query("select title, status from public.knowledge_sources order by title");
  expect(rows).toHaveLength(4);
  expect(rows).toContainEqual({ title: "Current upload", status: "uploading" });
  expect(rows).toContainEqual({ title: "Old processing", status: "processing" });
  expect(rows).toContainEqual({ title: "Other old upload", status: "uploading" });
  expect(rows).toContainEqual(outcomes[0].status === "fulfilled"
    ? { title: "New file", status: "uploading" }
    : { title: "Pasted text", status: "processing" });
});

it("starts pasted sources in processing with no storage key", async () => {
  await seedProjects();
  const { rows: reserved } = await service<{ source_id: string }>(
    "select * from public.reserve_knowledge_source($1, $2, 'Notes', 'text', $3)",
    [project, owner, limit.knowledgeSources],
  );
  const { rows } = await db.query("select status, storage_key from public.knowledge_sources where id = $1", [reserved[0].source_id]);
  expect(rows).toEqual([{ status: "processing", storage_key: null }]);
});

it("admits one caller at the final monthly message and rejects foreign conversations without counting", async () => {
  await seedProjects();
  await db.query("insert into public.conversations (id, project_id, visitor_id) values ($1, $2, 'visitor')", [foreignConversation, otherProject]);
  await db.query("update public.projects set messages_used = $2 where id = $1", [project, limit.messagesPerMonth - 1]);
  const sql = "select public.consume_message($1, $2, $3) as messages_used";
  await expect(service(sql, [project, limit.messagesPerMonth, foreignConversation]))
    .rejects.toMatchObject({ code: "PT404" });
  const outcomes = await Promise.allSettled(Array.from({ length: 2 }, () =>
    service(sql, [project, limit.messagesPerMonth, null]),
  ));
  expectLastSlot(outcomes, "PT429");
  expect(outcomes.find((result) => result.status === "fulfilled")?.value.rows).toEqual([
    { messages_used: limit.messagesPerMonth },
  ]);
  const { rows } = await db.query("select messages_used from public.projects where id = $1", [project]);
  expect(rows).toEqual([{ messages_used: limit.messagesPerMonth }]);
});

it("resets a previous UTC month before charging the first message", async () => {
  await seedProjects();
  await db.query(
    "update public.projects set messages_used = $2, period_start = date_trunc('month', now(), 'UTC') - interval '1 day' where id = $1",
    [project, limit.messagesPerMonth],
  );
  const result = await service("select public.consume_message($1, $2) as messages_used", [project, limit.messagesPerMonth]);
  expect(result.rows).toEqual([{ messages_used: 1 }]);
  const { rows } = await db.query("select period_start = date_trunc('month', now(), 'UTC') as reset from public.projects where id = $1", [project]);
  expect(rows).toEqual([{ reset: true }]);
});

it("creates and extends one conversation with visitor and bot messages in order", async () => {
  await seedProjects();
  const sql = "select public.save_chat_turn($1, 'visitor', $2, $3, $4) as conversation_id";
  const created = await service<{ conversation_id: string }>(sql, [project, "Hello", "Hi", null]);
  const { conversation_id: id } = created.rows[0];
  await expect(service(sql, [otherProject, "Foreign", "Ignored", id]))
    .rejects.toMatchObject({ code: "PT404" });
  await expect(service(sql, [project, "Next", "Reply", id]))
    .resolves.toMatchObject({ rows: [{ conversation_id: id }] });
  const { rows } = await db.query("select role, body from public.messages where conversation_id = $1 order by created_at", [id]);
  expect(rows).toEqual([
    { role: "visitor", body: "Hello" }, { role: "bot", body: "Hi" },
    { role: "visitor", body: "Next" }, { role: "bot", body: "Reply" },
  ]);
});

it("rolls back a failed chat turn while preserving the accepted message charge", async () => {
  await seedProjects();
  await service("select public.consume_message($1, $2)", [project, limit.messagesPerMonth]);
  await expect(service("select public.save_chat_turn($1, 'visitor', 'Hello', null)", [project]))
    .rejects.toMatchObject({ code: "23502" });
  const { rows } = await db.query(`
    select (select count(*) from public.conversations)::int as conversations,
      (select count(*) from public.messages)::int as messages,
      (select messages_used from public.projects where id = $1) as messages_used
  `, [project]);
  expect(rows).toEqual([{ conversations: 0, messages: 0, messages_used: 1 }]);
});

it("returns only the five closest ready chunks in the requested project", async () => {
  await seedProjects();
  const { rows: sources } = await db.query<{ id: string }>(`
    insert into public.knowledge_sources (project_id, title, type, status)
    values ($1, 'Ready', 'text', 'ready'), ($1, 'Failed', 'text', 'failed'),
      ($1, 'Processing', 'text', 'processing'), ($2, 'Foreign', 'text', 'ready')
    returning id
  `, [project, otherProject]);
  const embedding = (second: number) => `[1,${second},${Array(1534).fill(0).join(",")}]`;
  const insert = "insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, $3, $4)";
  for (let rank = 6; rank >= 1; rank--) {
    await db.query(insert, [project, sources[0].id, `Rank ${rank}`, embedding(rank)]);
  }
  await db.query(insert, [project, sources[1].id, "Failed match", embedding(0)]);
  await db.query(insert, [project, sources[2].id, "Processing match", embedding(0)]);
  await db.query(insert, [otherProject, sources[3].id, "Foreign match", embedding(0)]);
  const { rows } = await service<{ content: string; distance: number }>(
    "select content, distance from public.match_chunks($1, $2)", [project, embedding(0)],
  );
  expect(rows.map(({ content }) => content)).toEqual(["Rank 1", "Rank 2", "Rank 3", "Rank 4", "Rank 5"]);
  expect(rows[0].distance).toBeCloseTo(1 - 1 / Math.sqrt(2));
});

it("returns only the caller's activity and omits stale monthly usage and expired uploads", async () => {
  await seedProjects();
  await db.query("insert into public.conversations (project_id, visitor_id) values ($1, 'owner'), ($1, 'second'), ($2, 'other')", [project, otherProject]);
  await db.query(`
    insert into public.knowledge_sources (project_id, title, type, status, storage_key, created_at)
    values ($1, 'Expired', 'pdf', 'uploading', 'expired.pdf', now() - interval '3 hours'),
      ($1, 'Current', 'text', 'ready', null, now()),
      ($2, 'Other', 'text', 'ready', null, now()),
      ($2, 'More other', 'text', 'ready', null, now())
  `, [project, otherProject]);
  await db.query("update public.projects set messages_used = 3 where id = $1", [project]);
  await db.query("update public.projects set messages_used = 99, period_start = date_trunc('month', now(), 'UTC') - interval '1 day' where id = $1", [otherProject]);
  for (const [subject, expected] of [
    [owner, { projects: 1, knowledge_sources: 1, conversations: 2, messages_this_month: 3 }],
    [otherOwner, { projects: 1, knowledge_sources: 2, conversations: 1, messages_this_month: 0 }],
    [undefined, { projects: 0, knowledge_sources: 0, conversations: 0, messages_this_month: 0 }],
  ] as const) {
    const { rows } = await runAs(db, "authenticated", subject, (tx) => tx.query("select * from public.owner_activity()"));
    expect(rows).toEqual([expected]);
  }
});
