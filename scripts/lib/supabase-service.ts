import { createClient } from "@supabase/supabase-js";

const missingEnvMsg =
  "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
  "Create a .env.local file or set them in your environment.";

/** Service-role client for Node scripts (matches `getSupabaseServerClient` options). */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error(missingEnvMsg);
    process.exit(1);
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
