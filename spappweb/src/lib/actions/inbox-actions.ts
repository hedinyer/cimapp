"use server";

import { requireAdminSession } from "@/lib/auth/session";
import { getAllBikes, getInboxQueues } from "@/lib/pipeline/queries";

export async function refreshInboxQueues() {
  await requireAdminSession();
  return getInboxQueues();
}

/** Lazy: solo al abrir "Vender moto" en Hoy. */
export async function loadCatalogoMotosInbox() {
  await requireAdminSession();
  return getAllBikes();
}
