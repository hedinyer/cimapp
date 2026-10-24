import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "@/lib/supabase/public-env";

export const SESSION_SECRET =
  process.env.SESSION_SECRET ?? "spapp-admin-local-dev-secret-32chars-min";

export function getSupabaseUrl(): string {
  return SUPABASE_URL;
}

export function getSupabaseAnonKey(): string {
  return SUPABASE_ANON_KEY;
}

export function getConfigErrorMessage(): string | null {
  if (!SUPABASE_URL.trim() || !SUPABASE_ANON_KEY.trim()) {
    return "Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY en src/lib/supabase/public-env.ts.";
  }
  return null;
}
