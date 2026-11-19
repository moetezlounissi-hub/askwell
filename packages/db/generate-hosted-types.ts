import { execFile } from "node:child_process";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const projectRef = url && /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(url)?.[1];
if (!projectRef) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL to the dev project's Supabase URL.");
}

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  throw new Error("Set SUPABASE_ACCESS_TOKEN to generate hosted types. HQ agents use the dev Supabase MCP.");
}

const pnpm = process.env.npm_execpath;
if (!pnpm) {
  throw new Error("Run this command with pnpm db:types.");
}

const run = promisify(execFile);
const tempDir = await mkdtemp(fileURLToPath(new URL("./.types-", import.meta.url)));
try {
  const { stdout } = await run(process.execPath, [
    pnpm, "--reporter=silent", "dlx", "supabase@3.2.0",
    "gen", "types", "typescript", "--schema", "public", `--remote=${projectRef}`,
    "--agent=no", "--output-format=text",
  ], { cwd: tempDir, maxBuffer: 16 * 1024 * 1024, timeout: 120_000 });

  if (!stdout.startsWith("export type Json =") || !stdout.includes("export type Database =")) {
    throw new Error("Supabase CLI did not return TypeScript database types.");
  }

  const candidate = join(tempDir, "types.ts");
  await writeFile(candidate, stdout);
  await rename(candidate, new URL("./types.ts", import.meta.url));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
