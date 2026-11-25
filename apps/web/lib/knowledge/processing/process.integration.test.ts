import { expect, it, vi } from "vitest";
import { createSupabasePGlite, runAs } from "../../../../../packages/db/supabase-pglite";
import type { Tables, TablesInsert } from "@askwell/db";
import type { createServiceClient } from "../../supabase/service";
import { pdfFixture } from "./pdf-fixture";
import { processKnowledge } from "./process";
import { extractKnowledgeText } from "./text";

const create = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("openai", () => ({ default: class { embeddings = { create }; } }));

it("stores a PDF excerpt in pgvector and retrieves it through match_chunks", async () => {
  const db = await createSupabasePGlite();
  const project = "00000000-0000-4000-8000-000000000001";
  const source = "00000000-0000-4000-8000-000000000002";
  const embedding = Array<number>(1536).fill(1);
  try {
    await db.exec("insert into public.accounts (clerk_user_id) values ('owner')");
    await db.query("insert into public.projects (id, owner_id, name, public_key) values ($1, 'owner', 'Support', 'pk_support')", [project]);
    await db.query(
      "insert into public.knowledge_sources (id, project_id, title, type, storage_key, status) values ($1, $2, 'Hours', 'pdf', $3, 'processing')",
      [source, project, `${project}/hours.pdf`],
    );
    create.mockResolvedValueOnce({ data: [{ index: 0, embedding }] });

    // Bridge the two PostgREST writes to the actual migrated tables under service_role.
    await runAs(db, "service_role", undefined, async (tx) => {
      const client = {
        from(table: string) {
          if (table === "knowledge_chunks") {
            return {
              async insert(rows: TablesInsert<"knowledge_chunks">[]) {
                for (const row of rows) {
                  await tx.query("insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, $3, $4)",
                    [row.project_id, row.source_id, row.content, row.embedding]);
                }
                return { error: null };
              },
            };
          }
          return {
            update: ({ status }: { status: string }) => ({
              eq: (_projectColumn: string, projectId: string) => ({
                eq: (_idColumn: string, sourceId: string) => ({
                  eq: (_statusColumn: string, previous: string) => ({
                    select: () => ({
                      async single() {
                        const { rows } = await tx.query<Tables<"knowledge_sources">>(
                          "update public.knowledge_sources set status = $1 where project_id = $2 and id = $3 and status = $4 returning *",
                          [status, projectId, sourceId, previous],
                        );
                        return { data: rows[0], error: null };
                      },
                    }),
                  }),
                }),
              }),
            }),
          };
        },
      } as unknown as ReturnType<typeof createServiceClient>;
      const result = await processKnowledge(client, project, source, () => extractKnowledgeText(pdfFixture(), "pdf"));
      expect(result.status).toBe("ready");
      const { rows } = await tx.query("select content from public.match_chunks($1, $2)", [project, JSON.stringify(embedding)]);
      expect(rows).toEqual([{ content: "Support closes at six." }]);
    });
  } finally {
    await db.close();
  }
}, 20_000);
