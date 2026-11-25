import { timingSafeEqual } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { runKnowledgeCleanup } from "./cleanup.ts";

const encoder = new TextEncoder();

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });

  const token = Deno.env.get("KNOWLEDGE_CLEANUP_TOKEN");
  if (!token) return new Response(null, { status: 503 });

  const expected = encoder.encode(`Bearer ${token}`);
  const supplied = encoder.encode(request.headers.get("authorization") ?? "");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return new Response(null, { status: 401 });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as { default?: unknown } | null;
    const key = keys?.default;
    if (!url || typeof key !== "string" || !key) throw new Error("Missing Supabase configuration");

    const client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const result = await runKnowledgeCleanup({
      async collect() {
        const { data, error } = await client.rpc("collect_knowledge_cleanup");
        if (error) throw error;
        return (data as { storage_key: string }[]).map(({ storage_key }) => storage_key);
      },
      async remove(storageKey) {
        const { error } = await client.storage.from("knowledge").remove([storageKey]);
        if (error) throw error;
      },
      async acknowledge(storageKey) {
        const { error } = await client.rpc("complete_knowledge_cleanup", { p_storage_key: storageKey });
        if (error) throw error;
      },
    });
    if (result.failed) console.error("Knowledge cleanup will retry pending files", result);
    return Response.json(result, { status: result.failed ? 503 : 200 });
  } catch (error) {
    console.error("Knowledge cleanup could not run", error instanceof Error ? error.message : "RPC failed");
    return new Response(null, { status: 500 });
  }
});
