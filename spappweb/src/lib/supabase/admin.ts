import "server-only";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { trazarCliente } from "@/lib/uso/trazar-escrituras";

// ponytail: un solo cliente por proceso (igual que anon.ts)
let adminClient: SupabaseClient | null = null;

/** Cliente admin: siempre anon embebida (GRANTs amplios en este proyecto). */
export function createAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  adminClient = trazarCliente(
    createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
  );
  return adminClient;
}
