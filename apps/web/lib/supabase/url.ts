export function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value || URL.parse(value)?.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be an HTTPS URL.");
  }
  return value;
}
