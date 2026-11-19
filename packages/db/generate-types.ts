import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createSupabasePGlite } from "./supabase-pglite.ts";

const run = promisify(execFile);
const db = await createSupabasePGlite();
const server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 10 });

try {
  await server.start();
  const generator = fileURLToPath(
    import.meta.resolve("@supabase/postgres-meta/dist/server/server.js"),
  );
  const { stdout } = await run(process.execPath, [generator], {
    env: {
      PG_META_DB_URL: `postgresql://postgres@${server.getServerConn()}/postgres?sslmode=disable`,
      PG_META_GENERATE_TYPES: "typescript",
      PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS: "public",
      PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS: "true",
      PG_META_POSTGREST_VERSION: "14.18",
    },
    timeout: 60_000,
  });
  // Match the hosted generator's format for empty computed fields and parameterless RPCs.
  const types = stdout
    .replace(/^ +ComputedFields: never\r?\n/gm, "")
    .replace(/^( +Args: )Record<PropertyKey, never>$/gm, "$1never");
  await writeFile(new URL("./types.ts", import.meta.url), types);
} finally {
  await server.stop();
  await db.close();
}
