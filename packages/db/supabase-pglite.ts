import { readdir, readFile } from "node:fs/promises";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const migrations = new URL("../../supabase/migrations/", import.meta.url);

export async function createSupabasePGlite() {
  const db = await PGlite.create({ extensions: { vector } });
  try {
    // Model Supabase's request roles, JWT claim setting, and legacy default grants.
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create role supabase_storage_admin nologin;
      grant usage on schema public to supabase_storage_admin;
      alter default privileges in schema public
        grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public
        grant execute on functions to anon, authenticated, service_role;
      -- Model the managed Storage tables and request-role access used by migrations.
      create schema storage;
      create table storage.buckets (
        id text primary key,
        name text not null,
        public boolean default false,
        file_size_limit bigint,
        allowed_mime_types text[]
      );
      create table storage.objects (
        bucket_id text references storage.buckets (id),
        name text not null,
        primary key (bucket_id, name)
      );
      alter table storage.buckets enable row level security;
      alter table storage.objects enable row level security;
      alter table storage.objects owner to supabase_storage_admin;
      grant usage on schema storage to anon, authenticated, service_role, supabase_storage_admin;
      grant select, insert, update, delete on storage.buckets, storage.objects
        to anon, authenticated, service_role, supabase_storage_admin;
      create schema auth;
      create function auth.jwt() returns jsonb
        language sql stable set search_path = ''
        as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
      grant usage on schema auth to anon, authenticated, service_role;
    `);
    for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
      const sql = await readFile(new URL(file, migrations), "utf8");
      await db.transaction((tx) => tx.exec(sql));
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

type TestRole = "anon" | "authenticated" | "service_role" | "supabase_storage_admin";

export function runAs<T>(
  db: PGlite,
  role: TestRole,
  subject: string | undefined,
  operation: (tx: Transaction) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ role, sub: subject }),
    ]);
    return operation(tx);
  });
}
