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
      alter default privileges in schema public
        grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public
        grant execute on functions to anon, authenticated, service_role;
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

type TestRole = "anon" | "authenticated" | "service_role";

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
