"use server";

import { requireAdminSession } from "@/lib/auth/session";
import { searchClients } from "@/lib/pipeline/queries";

export async function searchChatMentions(query: string) {
  await requireAdminSession();
  const rows = await searchClients(query);
  return rows.slice(0, 6).map((row) => ({
    userId: row.userId,
    displayName: row.displayName,
    cedula: row.cedula,
    placa: row.placa,
  }));
}
