import { createBrowserClient } from "@supabase/ssr";

/**
 * Creates a singleton-like browser client for client components.
 * Strictly checks that public environment variables are defined.
 */
export function createBrowserClientInstance() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase Configuration: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required."
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

// Export default browser instance helper
export const getBrowserClient = createBrowserClientInstance;
