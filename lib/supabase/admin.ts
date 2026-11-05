import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  assertServiceRoleConfigured,
} from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Service-role client for background work: writing generated course content
 * and the model usage log. It must never be imported into a client component.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  assertServiceRoleConfigured();
  if (cached) return cached;

  cached = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
