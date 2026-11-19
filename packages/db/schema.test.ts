import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_WIDGET_CONFIG } from "../shared/src/widget";
import { createSupabasePGlite, runAs } from "./supabase-pglite";

const owners = ["user_alpha", "user_beta"] as const;
const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"] as const;
const tables = {
  accounts: "clerk_user_id",
  projects: "id",
  widget_configs: "project_id",
  knowledge_sources: "id",
  knowledge_chunks: "id",
  conversations: "id",
  messages: "id",
} as const;
const embedding = `[1,${Array(1535).fill(0).join(",")}]`;

let db: PGlite;

beforeAll(async () => {
  db = await createSupabasePGlite();
  await runAs(db, "service_role", undefined, async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx.query("insert into public.accounts (clerk_user_id) values ($1)", [owners[index]]);
      await tx.query(
        "insert into public.projects (id, owner_id, name, public_key) values ($1, $2, $3, $4)",
        [id, owners[index], `Project ${index}`, `pk_${index}`],
      );
      await tx.query("insert into public.widget_configs (project_id) values ($1)", [id]);
      await tx.query(
        "insert into public.knowledge_sources (id, project_id, title, type) values ($1, $1, 'Notes', 'text')",
        [id],
      );
      await tx.query(
        "insert into public.knowledge_chunks (id, project_id, source_id, content, embedding) values ($1, $1, $1, 'Text', $2)",
        [id, embedding],
      );
      await tx.query(
        "insert into public.conversations (id, project_id, visitor_id) values ($1, $1, 'visitor_1')",
        [id],
      );
      await tx.query(
        "insert into public.messages (id, conversation_id, role, body) values ($1, $1, 'visitor', 'Hello')",
        [id],
      );
    }
  });
}, 20_000);

afterAll(async () => {
  await db?.close();
});

describe("database roles", () => {
  it.each(Object.entries(tables))("isolates %s for both owners and blocks anonymous reads", async (table, key) => {
    const sql = `select ${key} as key from public.${table} order by ${key}`;
    for (const [index, owner] of owners.entries()) {
      const rows = await runAs(db, "authenticated", owner, async (tx) => (await tx.query(sql)).rows);
      expect(rows).toEqual([{ key: table === "accounts" ? owner : ids[index] }]);
    }
    const noSubject = await runAs(db, "authenticated", undefined, async (tx) => (await tx.query(sql)).rows);
    expect(noSubject).toEqual([]);
    await expect(runAs(db, "anon", owners[0], (tx) => tx.query(sql))).rejects.toMatchObject({ code: "42501" });
    const service = await runAs(db, "service_role", undefined, async (tx) => (await tx.query(sql)).rows);
    expect(service).toHaveLength(2);
  });

  it("limits writes and TRUNCATE privileges across all seven tables", async () => {
    const result = await db.query<{ table_name: string; rls: boolean; privileges_correct: boolean }>(`
      select c.relname as table_name, c.relrowsecurity as rls,
        not has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
        and not has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER')
        and has_table_privilege('authenticated', c.oid, 'DELETE') = (c.relname = 'projects')
        and has_table_privilege('service_role', c.oid, 'SELECT')
        and has_table_privilege('service_role', c.oid, 'INSERT')
        and has_table_privilege('service_role', c.oid, 'UPDATE')
        and has_table_privilege('service_role', c.oid, 'DELETE')
        and not has_table_privilege('service_role', c.oid, 'TRUNCATE') as privileges_correct
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname
    `);
    expect(result.rows).toEqual(Object.keys(tables).sort().map((table_name) => ({
      table_name, rls: true, privileges_correct: true,
    })));
    await expect(runAs(db, "authenticated", owners[0], (tx) =>
      tx.query("update public.accounts set plan = 'pro' where clerk_user_id = $1", [owners[0]]),
    )).rejects.toMatchObject({ code: "42501" });
    await expect(runAs(db, "authenticated", owners[0], (tx) =>
      tx.query("insert into public.projects (owner_id, name, public_key) values ($1, 'Extra', 'pk_Extra')", [owners[0]]),
    )).rejects.toMatchObject({ code: "42501" });
  });

  it("allows only the name column to be updated and limits renames and deletes to owned rows", async () => {
    const writable = await db.query(`
      select attname from pg_attribute
      where attrelid = 'public.projects'::regclass and attnum > 0
        and has_column_privilege('authenticated', attrelid, attnum, 'UPDATE')
    `);
    expect(writable.rows).toEqual([{ attname: "name" }]);
    await expect(runAs(db, "authenticated", owners[0], (tx) =>
      tx.query("update public.projects set owner_id = $1 where id = $2", [owners[1], ids[0]]),
    )).rejects.toMatchObject({ code: "42501" });

    await runAs(db, "authenticated", owners[0], async (tx) => {
      const own = await tx.query("update public.projects set name = 'Renamed' where id = $1 returning name", [ids[0]]);
      expect(own.rows).toEqual([{ name: "Renamed" }]);
      const rename = await tx.query("update public.projects set name = 'Renamed' where id = $1 returning id", [ids[1]]);
      const remove = await tx.query("delete from public.projects where id = $1 returning id", [ids[1]]);
      expect(rename.rows).toEqual([]);
      expect(remove.rows).toEqual([]);
    });
  });

  it("keeps both RLS helpers outside the exposed schema with an empty search path", async () => {
    const { rows } = await db.query(`
      select p.proname, p.prosecdef, p.proconfig,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role,
        has_schema_privilege('authenticated', n.oid, 'USAGE') as schema_usage
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private'
      order by p.proname
    `);
    expect(rows).toEqual(["owned_conversation_ids", "owned_project_ids"].map((proname) => ({
      proname, prosecdef: true, proconfig: ['search_path=""'],
      anon: false, authenticated: true, service_role: false, schema_usage: false,
    })));
  });

  it("allows service-only plan transitions and uses shared widget defaults", async () => {
    await runAs(db, "service_role", undefined, async (tx) => {
      const result = await tx.query("update public.accounts set plan = 'pro' where clerk_user_id = $1 returning plan", [owners[1]]);
      expect(result.rows).toEqual([{ plan: "pro" }]);
    });
    await runAs(db, "authenticated", owners[1], async (tx) => {
      const plan = await tx.query("select plan from public.accounts");
      expect(plan.rows).toEqual([{ plan: "pro" }]);
      const config = await tx.query(`
        select button_color as "buttonColor", position, label, animation,
          header_text as "headerText", show_badge as "showBadge"
        from public.widget_configs
      `);
      expect(config.rows).toEqual([DEFAULT_WIDGET_CONFIG]);
    });
  });
});

describe("schema integrity", () => {
  it("rejects a chunk linked to another project's source", async () => {
    await expect(runAs(db, "service_role", undefined, (tx) =>
      tx.query(
        "insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, 'Text', $3)",
        [ids[0], ids[1], embedding],
      ),
    )).rejects.toMatchObject({ code: "23503" });
  });

  it("enforces 1536 dimensions and supports cosine search through the HNSW index", async () => {
    await expect(runAs(db, "service_role", undefined, (tx) =>
      tx.query("update public.knowledge_chunks set embedding = '[1,0]'"),
    )).rejects.toMatchObject({ code: "22000" });
    await runAs(db, "service_role", undefined, async (tx) => {
      const search = `select embedding operator(extensions.<=>) $1::extensions.vector as distance
        from public.knowledge_chunks order by distance limit 1`;
      const result = await tx.query(search, [embedding]);
      expect(result.rows).toEqual([{ distance: 0 }]);
      await tx.exec("set local enable_seqscan = off");
      const plan = await tx.query(`explain ${search}`, [embedding]);
      expect(plan.rows).toEqual(expect.arrayContaining([
        { "QUERY PLAN": expect.stringContaining("using knowledge_chunks_embedding_idx") },
      ]));
    });
  });

  it("cascades source, owner project, and account deletions without removing another owner's rows", async () => {
    // Roll back this fixture's deletes so the checks stay independent.
    const rollback = new Error("rollback cascade fixture");
    await expect(db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      await tx.query("delete from public.knowledge_sources where id = $1", [ids[0]]);
      const chunks = await tx.query("select id from public.knowledge_chunks");
      expect(chunks.rows).toEqual([{ id: ids[1] }]);

      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: owners[0] })]);
      const deleted = await tx.query("delete from public.projects where id = $1 returning id", [ids[0]]);
      expect(deleted.rows).toEqual([{ id: ids[0] }]);

      await tx.exec("set local role service_role");
      for (const [table, key] of Object.entries(tables)) {
        const { rows } = await tx.query(`select ${key} as key from public.${table} order by ${key}`);
        expect(rows).toEqual(table === "accounts"
          ? owners.map((key) => ({ key }))
          : [{ key: ids[1] }]);
      }
      await tx.query("delete from public.accounts where clerk_user_id = $1", [owners[1]]);
      for (const table of Object.keys(tables).filter((table) => table !== "accounts")) {
        const { rows } = await tx.query(`select * from public.${table}`);
        expect(rows).toEqual([]);
      }
      throw rollback;
    })).rejects.toBe(rollback);
  });
});
