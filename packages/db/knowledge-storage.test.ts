import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PLAN_LIMITS } from "../shared/src/plans";
import { MAX_KNOWLEDGE_FILE_BYTES } from "../shared/src/widget";
import { createSupabasePGlite, runAs } from "./supabase-pglite";

let db: PGlite;

beforeAll(async () => {
  db = await createSupabasePGlite();
}, 20_000);

afterAll(async () => {
  await db?.close();
});

it("configures the private bucket with the shared 10 MiB limit and supported MIME types", async () => {
  const { rows } = await db.query(`
    select name, public, file_size_limit::integer, allowed_mime_types
    from storage.buckets where id = 'knowledge'
  `);
  expect(rows).toEqual([{
    name: "knowledge",
    public: false,
    file_size_limit: MAX_KNOWLEDGE_FILE_BYTES,
    allowed_mime_types: ["application/pdf", "text/markdown", "text/plain"],
  }]);
});

it("keeps direct object access denied for ordinary API roles", async () => {
  await db.exec(`
    insert into public.accounts (clerk_user_id) values ('private-owner');
    insert into public.projects (owner_id, name, public_key)
      values ('private-owner', 'Private', 'pk_private');
    select public.reserve_knowledge_source(id, owner_id, 'Private', 'pdf', 3, 'private.pdf')
      from public.projects where owner_id = 'private-owner';
    insert into storage.objects values ('knowledge', 'private.pdf');
  `);

  for (const role of ["anon", "authenticated"] as const) {
    const { rows } = await runAs(db, role, "owner", (tx) =>
      tx.query("select name from storage.objects"),
    );
    expect(rows).toEqual([]);
    await expect(runAs(db, role, "owner", (tx) =>
      tx.exec("insert into storage.objects values ('knowledge', 'direct.pdf')"),
    )).rejects.toMatchObject({ code: "42501" });
  }

  const { rows } = await runAs(db, "service_role", undefined, (tx) =>
    tx.query("select name from storage.objects where bucket_id = 'knowledge'"),
  );
  expect(rows).toEqual([{ name: "private.pdf" }]);
});

it.each(["free", "pro"] as const)("serializes %s file reservations at the source limit", async (plan) => {
  const owner = `owner_${plan}`;
  const limit = PLAN_LIMITS[plan].knowledgeSources;
  await db.query("insert into public.accounts (clerk_user_id, plan) values ($1, $2)", [owner, plan]);
  const { rows: [project] } = await db.query<{ id: string }>(
    "insert into public.projects (owner_id, name, public_key) values ($1, 'Test', $2) returning id",
    [owner, `pk_${plan}`],
  );
  await db.query(`
    insert into public.knowledge_sources (project_id, title, type, status)
    select $1, 'Notes', 'text', 'ready' from generate_series(1, $2)
  `, [project.id, limit - 1]);

  const outcomes = await Promise.allSettled(["first", "second"].map((name) =>
    runAs(db, "service_role", undefined, (tx) => tx.query(
      "select * from public.reserve_knowledge_source($1, $2, $3, 'pdf', $4, $5)",
      [project.id, owner, name, limit, `${project.id}/${name}.pdf`],
    )),
  ));

  expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter(({ status }) => status === "rejected")).toEqual([
    { status: "rejected", reason: expect.objectContaining({ code: "PT409" }) },
  ]);
  const { rows } = await db.query(
    "select status, count(*)::integer from public.knowledge_sources where project_id = $1 group by status order by status",
    [project.id],
  );
  expect(rows).toEqual([{ status: "ready", count: limit - 1 }, { status: "uploading", count: 1 }]);
});

async function reserveFile(name: string) {
  const owner = `storage-owner-${name}`;
  await db.query("insert into public.accounts (clerk_user_id) values ($1)", [owner]);
  const { rows: [project] } = await db.query<{ id: string }>(
    "insert into public.projects (owner_id, name, public_key) values ($1, 'Test', $2) returning id",
    [owner, `pk_${name}`],
  );
  const key = `${project.id}/test.pdf`;
  const { rows: [source] } = await runAs(db, "service_role", undefined, (tx) => tx.query<{ source_id: string }>(
    "select * from public.reserve_knowledge_source($1, $2, 'Test', 'pdf', 3, $3)",
    [project.id, owner, key],
  ));
  return { owner, projectId: project.id, sourceId: source.source_id, key };
}

function upload(key: string) {
  return runAs(db, "supabase_storage_admin", undefined, (tx) =>
    tx.query("insert into storage.objects values ('knowledge', $1)", [key]),
  );
}

it("claims an uploaded source once and rejects overwrite and replay after deletion", async () => {
  const { owner, projectId, sourceId, key } = await reserveFile("claim");
  const claim = (subject: string) => runAs(db, "service_role", undefined, (tx) =>
    tx.query("select status from public.claim_knowledge_upload($1, $2, $3)", [projectId, subject, sourceId]),
  );
  expect((await claim(owner)).rows).toEqual([]);
  await upload(key);
  await expect(upload(key)).rejects.toMatchObject({ code: "PT409" });
  await expect(runAs(db, "supabase_storage_admin", undefined, (tx) =>
    tx.query("update storage.objects set name = name where name = $1", [key]),
  )).rejects.toMatchObject({ code: "PT409" });
  expect((await claim("foreign")).rows).toEqual([]);
  expect((await Promise.all([claim(owner), claim(owner)])).flatMap(({ rows }) => rows)).toEqual([
    { status: "processing" },
  ]);

  await db.query(`
    insert into public.knowledge_chunks (project_id, source_id, content, embedding)
    values ($1, $2, 'chunk', array_fill(0::real, array[1536])::extensions.vector)
  `, [projectId, sourceId]);

  const remove = (subject: string) => runAs(db, "service_role", undefined, (tx) =>
    tx.query("select * from public.delete_knowledge_source($1, $2)", [subject, sourceId]),
  );
  expect((await remove("foreign")).rows).toEqual([]);
  expect((await remove(owner)).rows).toEqual([{ storage_key: key }]);
  expect((await db.query("select id from public.knowledge_chunks where source_id = $1", [sourceId])).rows).toEqual([]);
  await db.query("delete from storage.objects where name = $1", [key]);
  await expect(upload(key)).rejects.toMatchObject({ code: "PT409" });
});

it("revokes expired reservations and retains unacknowledged cleanup across runs", async () => {
  const { sourceId, key } = await reserveFile("expiry");
  await upload(key);
  await db.query("update public.knowledge_sources set created_at = now() - interval '121 minutes' where id = $1", [sourceId]);
  await expect(upload(key)).rejects.toMatchObject({ code: "PT409" });
  const collect = () => runAs(db, "service_role", undefined, (tx) =>
    tx.query("select * from public.collect_knowledge_cleanup()"),
  );
  expect((await collect()).rows).toContainEqual({ storage_key: key });
  expect((await collect()).rows).toContainEqual({ storage_key: key });
  expect((await db.query("select id from public.knowledge_sources where id = $1", [sourceId])).rows).toEqual([]);
  await db.query("delete from storage.objects where name = $1", [key]);
  await runAs(db, "service_role", undefined, (tx) =>
    tx.query("select public.complete_knowledge_cleanup($1)", [key]),
  );
  expect((await collect()).rows).not.toContainEqual({ storage_key: key });
  await expect(upload(key)).rejects.toMatchObject({ code: "PT409" });
});

it("retains file keys after project deletion and denies cleanup RPCs to API clients", async () => {
  const { owner, projectId, key } = await reserveFile("cascade");
  await upload(key);
  await runAs(db, "authenticated", owner, (tx) =>
    tx.query("delete from public.projects where id = $1", [projectId]),
  );
  await expect(runAs(db, "authenticated", owner, (tx) =>
    tx.query("select * from public.collect_knowledge_cleanup()"),
  )).rejects.toMatchObject({ code: "42501" });
  expect((await runAs(db, "service_role", undefined, (tx) =>
    tx.query("select * from public.collect_knowledge_cleanup()"),
  )).rows).toContainEqual({ storage_key: key });
});

it("rejects a first upload after the owner revokes its reservation", async () => {
  const { owner, sourceId, key } = await reserveFile("revoked");
  await runAs(db, "service_role", undefined, (tx) =>
    tx.query("select * from public.delete_knowledge_source($1, $2)", [owner, sourceId]),
  );
  await expect(upload(key)).rejects.toMatchObject({ code: "PT409" });
  expect((await db.query("select name from storage.objects where name = $1", [key])).rows).toEqual([]);
});

it("rolls back the Storage permission probe without consuming the reservation", async () => {
  const { key } = await reserveFile("probe");
  await expect(runAs(db, "service_role", undefined, async (tx) => {
    await tx.query("insert into storage.objects values ('knowledge', $1)", [key]);
    throw new Error("probe rolled back");
  })).rejects.toThrow("probe rolled back");
  await upload(key);
});
