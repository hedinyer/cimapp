import "server-only";

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { describirUso, type UsoEvento } from "@/lib/uso/describir";

const USO_SECRET = "all4cfl-uso-grafo";
const COOKIE = "uso_sesion";

function client() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function sesionUsoId(): Promise<string | null> {
  try {
    const jar = await cookies();
    const value = jar.get(COOKIE)?.value?.trim();
    if (value && /^[0-9a-f-]{36}$/i.test(value)) return value;
  } catch {
    return null;
  }
  return null;
}

export async function registrarUso(eventos: UsoEvento[]): Promise<void> {
  if (eventos.length === 0) return;
  try {
    const sesion = await sesionUsoId();
    if (!sesion) return;
    const session = await getSession();
    const username = session.username?.trim() || "agente";
    const userId = session.userId ?? null;
    const lote = eventos.slice(0, 30).map((evento) => describirUso(username, evento));
    await client().rpc("registrar_uso_lote", {
      p_secret: USO_SECRET,
      p_sesion: sesion,
      p_user_id: userId,
      p_username: username,
      p_eventos: lote,
    });
  } catch {
    // el registro no puede romper la acción del panel
  }
}

export async function exportarTrayectorias(limit = 50): Promise<unknown> {
  const { data, error } = await client().rpc("exportar_uso_trayectorias", {
    p_secret: USO_SECRET,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}
