import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import { getSupabaseUrl } from "./url";

export function createServiceClient() {
  const url = getSupabaseUrl();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is required.");
  }

  return createClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
