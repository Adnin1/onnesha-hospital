import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";

function getSupabasePublicConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase Environment Variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) must be provided in production."
    );
  }

  return { supabaseUrl, supabaseKey };
}

/**
 * Normal application browser client.
 *
 * Supabase handles OAuth/implicit URL sessions automatically and PKCE is
 * enabled for normal authentication flows.
 */
export function createClient() {
  const { supabaseUrl, supabaseKey } = getSupabasePublicConfig();

  return createSsrBrowserClient(supabaseUrl, supabaseKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
    },
  });
}

/**
 * Dedicated password-recovery browser client.
 *
 * The /auth/confirm page performs the PKCE code exchange itself. Automatic
 * URL detection must therefore be disabled for this client; otherwise the
 * same single-use PKCE authorization code can be consumed by client
 * initialization before the page's explicit exchange runs.
 */
export function createRecoveryBrowserClient() {
  const { supabaseUrl, supabaseKey } = getSupabasePublicConfig();

  return createSsrBrowserClient(supabaseUrl, supabaseKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: false,
    },
  });
}

export { createClient as createBrowserClient };
