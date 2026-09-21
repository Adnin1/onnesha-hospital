import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Admin Client.
 * Uses SUPABASE_SECRET_KEY (Supabase 2026 modern key name) with
 * SUPABASE_SERVICE_ROLE_KEY as legacy fallback (deprecated end-2026).
 * Strictly forbidden from being called or imported into client components.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "Admin Client Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) must be defined. Never expose this key to the browser."
    );
  }

  return createSupabaseClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
