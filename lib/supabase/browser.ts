import { createBrowserClient } from "@supabase/ssr";

/**
 * Creates a singleton-like browser client for client components.
 * Strictly checks that public environment variables are defined.
 */
export function createBrowserClientInstance() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase Configuration: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) are required."
    );
  }

  return createBrowserClient(supabaseUrl, supabaseKey);
}

// Export default browser instance helper
export const getBrowserClient = createBrowserClientInstance;
