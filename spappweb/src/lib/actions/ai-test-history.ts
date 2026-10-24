"use server";

import { requireAdminSession } from "@/lib/auth/session";
import { normalizeLibrary, type StoredLibrary } from "@/lib/artifacts/stored-chat";
import { createAdminClient } from "@/lib/supabase/admin";

function secret(): string {
  return process.env.AI_TEST_HISTORY_SECRET?.trim() ?? "";
}

export async function loadAiTestHistory(): Promise<StoredLibrary | null> {
  const session = await requireAdminSession();
  const key = secret();
  if (!key || session.userId == null) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("ai_test_leer", {
    p_secret: key,
    p_user_id: session.userId,
  });
  if (error || !data || typeof data !== "object") return null;
  return normalizeLibrary(data);
}

export async function saveAiTestHistory(payload: StoredLibrary): Promise<{ ok: boolean }> {
  const session = await requireAdminSession();
  const key = secret();
  if (!key || session.userId == null) return { ok: false };
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("ai_test_guardar", {
    p_secret: key,
    p_user_id: session.userId,
    p_payload: payload,
  });
  return { ok: !error };
}
